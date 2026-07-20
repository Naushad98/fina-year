import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Trash2, 
  ChevronRight, 
  ArrowLeft, 
  ShieldAlert, 
  CheckCircle2, 
  MapPin, 
  HelpCircle,
  Search,
  Filter
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Statements = () => {
  const { apiCall } = useAuth();
  
  // State lists
  const [statements, setStatements] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatement, setSelectedStatement] = useState(null);
  const [statementTransactions, setStatementTransactions] = useState([]);
  const [txnLoading, setTxnLoading] = useState(false);

  // File Upload State
  const [targetAccountId, setTargetAccountId] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // Overlap Warning State
  const [overlapData, setOverlapData] = useState(null);

  // Column Mapping Fallback State
  const [mappingData, setMappingData] = useState(null);
  const [fieldMappings, setFieldMappings] = useState({
    date: '',
    description: '',
    debit: '',
    credit: '',
    balance: '',
    amount: '',
    type: ''
  });
  const [mappingUseAmountType, setMappingUseAmountType] = useState(false);

  // Filters for statement transaction view
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const loadStatementsData = async () => {
    try {
      setLoading(true);
      const statementsRes = await apiCall('/statements');
      const accountsRes = await apiCall('/accounts');
      
      if (statementsRes.ok && accountsRes.ok) {
        const stats = await statementsRes.json();
        const accs = await accountsRes.json();
        
        setStatements(stats);
        setAccounts(accs);
        
        if (accs.length > 0 && !targetAccountId) {
          setTargetAccountId(accs[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load statements page data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatementsData();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadError('');
      setUploadSuccess('');
      setOverlapData(null);
      setMappingData(null);
    }
  };

  // Perform upload
  const handleUploadSubmit = async (confirmMerge = false, customMapping = null) => {
    if (!selectedFile || !targetAccountId) {
      setUploadError('Please select a file and an account.');
      return;
    }

    setUploadLoading(true);
    setUploadError('');
    setUploadSuccess('');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('accountId', targetAccountId);
    
    if (confirmMerge) {
      formData.append('confirmMerge', 'true');
    }
    
    if (customMapping) {
      formData.append('mappingJson', JSON.stringify(customMapping));
    }

    try {
      const res = await apiCall('/statements/upload', {
        method: 'POST',
        body: formData // Note: Content-Type is auto-injected by browser for FormData
      });

      const data = await res.json();

      // Check if overlap warning status is hit (202 Accepted)
      if (res.status === 202 && data.overlap_warning) {
        setOverlapData(data);
        setUploadLoading(false);
        return;
      }

      // Check if custom mapping required
      if (data.requires_mapping) {
        setMappingData(data);
        // Pre-fill suggested mappings if fuzzy matched
        const initial = { ...fieldMappings };
        Object.keys(data.suggested_mapping).forEach(key => {
          initial[key] = data.suggested_mapping[key];
        });
        setFieldMappings(initial);
        
        // Auto check if amount is suggested
        if (data.suggested_mapping.amount) {
          setMappingUseAmountType(true);
        }
        
        setUploadLoading(false);
        return;
      }

      if (res.ok) {
        setUploadSuccess(data.message);
        setSelectedFile(null);
        setOverlapData(null);
        setMappingData(null);
        loadStatementsData();
      } else {
        setUploadError(data.error || 'Failed to upload statement.');
      }
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploadLoading(false);
    }
  };

  const handleApplyCustomMapping = () => {
    // Construct final mapping object based on standard selected
    const activeMapping = {
      date: fieldMappings.date,
      description: fieldMappings.description,
      balance: fieldMappings.balance
    };

    if (mappingUseAmountType) {
      if (!fieldMappings.amount) {
        setUploadError('Mapping error: Amount column is required.');
        return;
      }
      activeMapping.amount = fieldMappings.amount;
      if (fieldMappings.type) {
        activeMapping.type = fieldMappings.type;
      }
    } else {
      if (!fieldMappings.debit || !fieldMappings.credit) {
        setUploadError('Mapping error: Debit and Credit columns are required.');
        return;
      }
      activeMapping.debit = fieldMappings.debit;
      activeMapping.credit = fieldMappings.credit;
    }

    // Submit statement upload again with mapping payload
    handleUploadSubmit(false, activeMapping);
  };

  const handleInspectStatement = async (statement) => {
    setSelectedStatement(statement);
    setTxnLoading(true);
    setSearchTerm('');
    setStatusFilter('All');
    setCategoryFilter('All');

    try {
      const res = await apiCall(`/statements/${statement.id}/transactions`);
      if (res.ok) {
        const txns = await res.json();
        setStatementTransactions(txns);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to retrieve statement details.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setTxnLoading(false);
    }
  };

  const handleDeleteStatement = async (statementId, e) => {
    e.stopPropagation(); // prevent inspecting click trigger
    if (!window.confirm('Delete this statement record? Associated transactions will be removed from your registers.')) {
      return;
    }

    try {
      const res = await apiCall(`/statements/${statementId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        loadStatementsData();
        if (selectedStatement && selectedStatement.id === statementId) {
          setSelectedStatement(null);
        }
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to delete statement.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
  };

  const getRiskColor = (score) => {
    if (score < 35.0) return 'text-success bg-success/10 border-success/20';
    if (score < 70.0) return 'text-warning bg-warning/10 border-warning/20';
    return 'text-destructive bg-destructive/10 border-destructive/20';
  };

  // Transaction Filters Application
  const filteredTransactions = statementTransactions.filter(txn => {
    const matchesSearch = txn.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesStatus = true;
    if (statusFilter === 'Safe') matchesStatus = txn.status === 'Transferred';
    else if (statusFilter === 'Suspicious') matchesStatus = txn.status === 'Pending';
    else if (statusFilter === 'High Risk / Fraud') matchesStatus = txn.status === 'Flagged as Fraud';

    let matchesCategory = true;
    if (categoryFilter !== 'All') matchesCategory = txn.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const uniqueCategories = [...new Set(statementTransactions.map(t => t.category))];

  const triggerCSVDownload = (headers, rows, filename) => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadChaseMockCSV = () => {
    const headers = ['Date', 'Description', 'Amount', 'Balance'];
    const rows = [
      ['2026-07-10', 'CORP PAYROLL / SALARY DEPOSIT', '5200.00', '15200.00'],
      ['2026-07-11', 'WHOLE FOODS GROCERY STORE', '-142.30', '15057.70'],
      ['2026-07-12', 'NETFLIX DIGITAL BILLING', '-15.49', '15042.21'],
      ['2026-07-15', 'ATM CASH WITHDRAWAL DOWNTOWN', '-5000.00', '10042.21'],
      ['2026-07-18', 'UPI WIRE TO SUSPECT_BEN_04', '-12000.00', '-1957.79']
    ];
    triggerCSVDownload(headers, rows, 'chase_mock_statement_auto');
  };

  const downloadBarclaysMockCSV = () => {
    const headers = ['Value Date', 'Transaction Description', 'Withdrawal Amt', 'Deposit Amt', 'Running Balance'];
    const rows = [
      ['10-Jul-2026', 'MOCK DEPOSIT', '', '3200.00', '3200.00'],
      ['11-Jul-2026', 'GROCERY EXPENDITURE', '150.00', '', '3050.00'],
      ['12-Jul-2026', 'UPI WIRE TRANSFER TO MERCHANT', '2500.00', '', '550.00'],
      ['12-Jul-2026', 'UPI WIRE TRANSFER TO MERCHANT', '2500.00', '', '-1950.00']
    ];
    triggerCSVDownload(headers, rows, 'barclays_mock_statement_manual');
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div className="flex items-center gap-4">
        {selectedStatement && (
          <button 
            onClick={() => setSelectedStatement(null)}
            className="p-2 border border-border rounded-xl hover:bg-muted text-foreground transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {selectedStatement ? `Statement Inspector: ${selectedStatement.filename}` : 'Bank Statements'}
          </h1>
          <p className="text-muted-foreground text-sm">
            {selectedStatement ? `Showing logs for statement period ${selectedStatement.start_date} to ${selectedStatement.end_date}` : 'Upload and audit statements using modular ML risk assessments.'}
          </p>
        </div>
      </div>

      {!selectedStatement ? (
        // Main view list and upload boxes
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* History Lists */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Statement History Logs ({statements.length})
            </h2>

            {loading ? (
              <div className="space-y-4 animate-pulse">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-muted rounded-2xl"></div>
                ))}
              </div>
            ) : statements.length === 0 ? (
              <div className="glass-panel p-10 text-center rounded-2xl text-muted-foreground flex flex-col items-center justify-center space-y-4">
                <FileText className="h-16 w-16 stroke-[1.2] text-primary/30" />
                <div>
                  <p className="font-semibold text-foreground text-base">No statements uploaded yet</p>
                  <p className="text-xs">Select bank records on the right panel to extract and analyze files.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {statements.map((s) => (
                  <div 
                    key={s.id}
                    onClick={() => handleInspectStatement(s)}
                    className="glass-panel p-5 rounded-2xl flex items-center justify-between cursor-pointer border border-border hover:border-primary/20 transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="p-3 bg-primary/10 text-primary rounded-xl dark:bg-primary/20">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors max-w-[300px]" title={s.filename}>
                          {s.filename}
                        </h3>
                        <div className="flex items-center gap-x-2 text-[10px] text-muted-foreground font-semibold uppercase mt-1">
                          <span>{s.bank_name}</span>
                          <span>•</span>
                          <span>{s.transaction_count} Txns</span>
                          <span>•</span>
                          <span className={s.fraud_count > 0 ? 'text-destructive font-bold' : 'text-success'}>
                            {s.fraud_count} Fraud Warnings
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right hidden sm:block">
                        <span className="text-[10px] font-bold text-muted-foreground block uppercase">UPLOAD DATE</span>
                        <span className="text-xs text-foreground font-medium">{s.upload_date.split('T')[0]}</span>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteStatement(s.id, e)}
                        className="p-2 border border-border text-destructive rounded-xl hover:bg-destructive/10 hover:border-destructive/30 transition-all"
                        title="Delete Statement Log"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upload Area */}
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl space-y-6">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-foreground">Import Statement</h2>
                <p className="text-muted-foreground text-xs">Verify CSV, XLS, or PDF tables.</p>
              </div>

              {/* Upload form */}
              <div className="space-y-4">
                {uploadError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span className="truncate">{uploadError}</span>
                  </div>
                )}
                {uploadSuccess && (
                  <div className="p-3 bg-success/10 border border-success/20 text-success text-xs rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                {/* Target account */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Target Account Link</label>
                  <select
                    value={targetAccountId}
                    onChange={(e) => setTargetAccountId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.bank_name} ({acc.account_number})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Drag / Drop Area */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Upload File</label>
                  <div className="border-2 border-dashed border-border hover:border-primary/30 rounded-2xl p-6 text-center transition-all bg-card/40 cursor-pointer relative group">
                    <input 
                      type="file" 
                      onChange={handleFileChange}
                      accept=".csv, .xlsx, .xls, .pdf"
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground group-hover:text-primary transition-colors stroke-[1.5]" />
                    <span className="text-xs font-bold text-foreground block group-hover:text-primary transition-colors">
                      {selectedFile ? selectedFile.name : 'Choose a file'}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-1">Supports PDF, CSV, Excel (Max 10MB)</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUploadSubmit(false)}
                  disabled={uploadLoading || !selectedFile || accounts.length === 0}
                  className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/10 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {uploadLoading ? 'Uploading and Scoring...' : 'Analyze and Import'}
                </button>

                <div className="pt-2 border-t border-border/60 text-center">
                  <span className="text-[10px] text-muted-foreground font-semibold block uppercase mb-1.5">Need Demo Files?</span>
                  <div className="flex justify-center gap-3 text-[10px] font-bold">
                    <button type="button" onClick={downloadChaseMockCSV} className="text-primary hover:underline">
                      Chase (Auto-mapped)
                    </button>
                    <span className="text-muted-foreground">|</span>
                    <button type="button" onClick={downloadBarclaysMockCSV} className="text-primary hover:underline">
                      Barclays (Manual Mapping)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Overlap Warning Box */}
            {overlapData && (
              <div className="glass-panel p-5 rounded-2xl border-warning/40 bg-warning/5 glow-gold space-y-4 animate-fadeIn">
                <div className="flex gap-2 text-warning">
                  <ShieldAlert className="h-5 w-5 shrink-0" />
                  <h4 className="font-bold text-sm text-foreground">Overlap Detected</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {overlapData.message}
                </p>
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleUploadSubmit(true)}
                    className="w-full py-2 bg-warning text-warning-foreground font-bold text-xs rounded-xl hover:bg-warning/90 transition-all"
                  >
                    Merge & Skip Duplicates
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverlapData(null)}
                    className="w-full py-2 border border-border text-foreground hover:bg-muted font-bold text-xs rounded-xl transition-all"
                  >
                    Cancel Upload
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Detailed inspect view of statement transactions
        <div className="space-y-6 animate-fadeIn">
          {/* Filters Bar */}
          <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search description..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex w-full md:w-auto gap-3 flex-wrap">
              {/* Category selector */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground w-full md:w-auto">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                >
                  <option value="All">All Categories</option>
                  {uniqueCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Threat Selector */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
              >
                <option value="All">All Risk Profiles</option>
                <option value="Safe">Safe (Verified)</option>
                <option value="Suspicious">Suspicious</option>
                <option value="High Risk / Fraud">High Risk / Fraud</option>
              </select>
            </div>
          </div>

          {/* Transactions Inspector Grid */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            {txnLoading ? (
              <p className="text-sm text-center py-12 text-muted-foreground">Retrieving statement transactions...</p>
            ) : filteredTransactions.length === 0 ? (
              <p className="text-sm text-center py-12 text-muted-foreground">No transactions match your current filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-semibold">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Description</th>
                      <th className="pb-3 font-medium">Category</th>
                      <th className="pb-3 font-medium text-right">Debit</th>
                      <th className="pb-3 font-medium text-right">Credit</th>
                      <th className="pb-3 font-medium text-right">Balance</th>
                      <th className="pb-3 font-medium text-right">Risk Score</th>
                      <th className="pb-3 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredTransactions.map((txn) => (
                      <tr key={txn.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 text-muted-foreground">{txn.date}</td>
                        <td className="py-3 font-semibold text-foreground max-w-xs truncate" title={txn.description}>{txn.description}</td>
                        <td className="py-3">
                          <span className="text-[9px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full uppercase tracking-wider">
                            {txn.category}
                          </span>
                        </td>
                        <td className="py-3 text-right text-foreground font-bold">
                          {txn.type === 'debit' ? formatCurrency(txn.amount) : '-'}
                        </td>
                        <td className="py-3 text-right text-success font-bold">
                          {txn.type === 'credit' ? formatCurrency(txn.amount) : '-'}
                        </td>
                        <td className="py-3 text-right font-medium text-muted-foreground">
                          {formatCurrency(txn.balance)}
                        </td>
                        <td className="py-3 text-right font-semibold text-muted-foreground">{txn.risk_score}%</td>
                        <td className="py-3 text-center">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getRiskColor(txn.risk_score)}`}>
                            {txn.status === 'Flagged as Fraud' ? 'FRAUD' : (txn.status === 'Pending' ? 'SUSPICIOUS' : 'SAFE')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Column Mapping Fallback Overlay Screen */}
      {mappingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-4xl bg-card border border-border rounded-2xl shadow-xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            
            {/* Header Title */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Universal Column Mapper Fallback
                </h3>
                <p className="text-xs text-muted-foreground">Configure columns to parse this statement template successfully.</p>
              </div>
              <button 
                onClick={() => setMappingData(null)}
                className="text-xs font-semibold px-3 py-1 border border-border text-foreground hover:bg-muted rounded-lg"
              >
                Abort Mapping
              </button>
            </div>

            {/* Selection Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/30 p-5 rounded-2xl border border-border">
              <div className="space-y-4">
                <h4 className="font-bold text-xs text-foreground uppercase tracking-wide">Mapping Schema Options</h4>
                
                {/* Checkbox for Single Amount column */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={mappingUseAmountType}
                    onChange={(e) => setMappingUseAmountType(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary/20 h-4 w-4"
                  />
                  <span className="text-xs font-semibold text-foreground">Statement uses a single Amount column with a Type (Cr/Dr) column</span>
                </label>

                {/* Standard columns selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Date *</label>
                    <select
                      value={fieldMappings.date}
                      onChange={(e) => setFieldMappings({ ...fieldMappings, date: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                    >
                      <option value="">Select column...</option>
                      {mappingData.detected_headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Description *</label>
                    <select
                      value={fieldMappings.description}
                      onChange={(e) => setFieldMappings({ ...fieldMappings, description: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                    >
                      <option value="">Select column...</option>
                      {mappingData.detected_headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Balance *</label>
                    <select
                      value={fieldMappings.balance}
                      onChange={(e) => setFieldMappings({ ...fieldMappings, balance: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                    >
                      <option value="">Select column...</option>
                      {mappingData.detected_headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Monetary Details columns mapping */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-border/80 pt-4 md:pt-0 md:pl-6">
                <h4 className="font-bold text-xs text-foreground uppercase tracking-wide">Monetary Mapping</h4>
                
                {mappingUseAmountType ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Amount *</label>
                      <select
                        value={fieldMappings.amount}
                        onChange={(e) => setFieldMappings({ ...fieldMappings, amount: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                      >
                        <option value="">Select column...</option>
                        {mappingData.detected_headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Type (Dr/Cr)</label>
                      <select
                        value={fieldMappings.type}
                        onChange={(e) => setFieldMappings({ ...fieldMappings, type: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                      >
                        <option value="">Select column...</option>
                        {mappingData.detected_headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Debit *</label>
                      <select
                        value={fieldMappings.debit}
                        onChange={(e) => setFieldMappings({ ...fieldMappings, debit: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                      >
                        <option value="">Select column...</option>
                        {mappingData.detected_headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Credit *</label>
                      <select
                        value={fieldMappings.credit}
                        onChange={(e) => setFieldMappings({ ...fieldMappings, credit: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                      >
                        <option value="">Select column...</option>
                        {mappingData.detected_headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleApplyCustomMapping}
                    className="w-full py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-xs hover:bg-primary/95 transition-all shadow-md shadow-primary/10"
                  >
                    Apply and Parse
                  </button>
                </div>
              </div>
            </div>

            {/* First 5 rows Preview Table */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-foreground block">Raw File Data Preview (First 5 Rows):</span>
              <div className="overflow-x-auto border border-border/80 rounded-xl">
                <table className="w-full text-left text-[10px] border-collapse bg-background">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-bold">
                      {mappingData.detected_headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 shrink-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappingData.preview_rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-muted/10 transition-colors">
                        {mappingData.detected_headers.map((h, colIdx) => (
                          <td key={colIdx} className="px-3 py-2 text-foreground font-medium border-b border-border/20 truncate max-w-[150px]" title={row[h]}>
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Statements;
