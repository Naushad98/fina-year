import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Download, 
  Check, 
  X, 
  Filter, 
  Search, 
  HelpCircle, 
  Sparkles,
  TrendingDown,
  DollarSign
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const FraudCenter = () => {
  const { apiCall } = useAuth();
  
  // Lists state
  const [flaggedTransactions, setFlaggedTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Aggregated trends state
  const [trends, setTrends] = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(true);

  // Filters state
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Retrain status tracking
  const [retrainToast, setRetrainToast] = useState(null);

  const fetchFraudData = async () => {
    try {
      setLoading(true);
      // Construct query string
      let qs = [];
      if (selectedAccountId) qs.push(`accountId=${selectedAccountId}`);
      if (selectedRiskLevel) qs.push(`riskLevel=${selectedRiskLevel}`);
      if (searchQuery) qs.push(`search=${encodeURIComponent(searchQuery)}`);
      
      const queryStr = qs.length > 0 ? `?${qs.join('&')}` : '';
      
      const res = await apiCall(`/fraud${queryStr}`);
      if (res.ok) {
        const data = await res.json();
        setFlaggedTransactions(data);
      }
    } catch (err) {
      console.error('Failed to retrieve flagged transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrends = async () => {
    try {
      setTrendsLoading(true);
      const res = await apiCall('/analytics/fraud-trends');
      if (res.ok) {
        const data = await res.json();
        setTrends(data);
      }
    } catch (err) {
      console.error('Failed to load fraud trends:', err);
    } finally {
      setTrendsLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await apiCall('/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (err) {
      console.error('Failed to load accounts list:', err);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchTrends();
  }, []);

  useEffect(() => {
    fetchFraudData();
  }, [selectedAccountId, selectedRiskLevel, searchQuery]);

  // Submit feedback loop
  const handleSubmitFeedback = async (txnId, feedbackType) => {
    if (!window.confirm(`Are you sure you want to ${feedbackType === 'confirm_fraud' ? 'CONFIRM' : 'DISMISS'} this transaction as fraud? This will retrain the ML model.`)) {
      return;
    }

    try {
      const res = await apiCall(`/fraud/${txnId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: feedbackType })
      });

      const data = await res.json();
      if (res.ok) {
        fetchFraudData();
        fetchTrends();
        
        // Show retraining results toast banner
        if (data.model_metrics) {
          setRetrainToast({
            message: data.message,
            metrics: data.model_metrics
          });
          // Auto hide toast after 8 seconds
          setTimeout(() => setRetrainToast(null), 8000);
        } else {
          alert(data.message);
        }
      } else {
        alert(data.error || 'Failed to submit feedback.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Client-side CSV generator for filtered list only
  const handleExportCSV = () => {
    if (flaggedTransactions.length === 0) return;
    
    const headers = ['Date', 'Bank', 'Account (Masked)', 'Description', 'Amount (₹)', 'Category', 'Risk Score (%)', 'Reasons'];
    
    const rows = flaggedTransactions.map(t => [
      t.date.split(' ')[0],
      t.bank_name,
      t.account_number,
      t.description,
      t.amount,
      t.category,
      t.risk_score,
      t.fraud_reason || ''
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `fraudshield_flagged_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
  };

  const getRiskBadgeColor = (score) => {
    if (score >= 70.0) return 'text-destructive bg-destructive/10 border-destructive/20';
    return 'text-warning bg-warning/10 border-warning/20';
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Fraud Center</h1>
          <p className="text-muted-foreground text-sm">Review, verify, and resolve anomalies detected by our hybrid machine learning pipeline.</p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={flaggedTransactions.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/10 disabled:opacity-50"
        >
          <Download className="h-4.5 w-4.5" />
          Export Flagged (CSV)
        </button>
      </div>

      {/* Retraining model toast success message */}
      {retrainToast && (
        <div className="p-4 bg-success/15 border border-success/30 text-success rounded-2xl flex items-start gap-3 animate-fadeIn shadow-lg shadow-success/5">
          <Sparkles className="h-6 w-6 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-sm text-foreground">Model Retrained Successfully</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{retrainToast.message}</p>
            <div className="flex flex-wrap gap-4 mt-2 text-[10px] uppercase font-semibold text-foreground bg-success/10 px-3 py-1.5 rounded-xl border border-success/20 w-fit">
              <span>Accuracy: {(retrainToast.metrics.accuracy * 100).toFixed(1)}%</span>
              <span>•</span>
              <span>Precision: {(retrainToast.metrics.precision * 100).toFixed(1)}%</span>
              <span>•</span>
              <span>Recall: {(retrainToast.metrics.recall * 100).toFixed(1)}%</span>
              <span>•</span>
              <span>F1 Score: {(retrainToast.metrics.f1_score * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Fraud Metrics Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3.5 bg-destructive/15 text-destructive rounded-2xl dark:bg-destructive/20">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground block uppercase">Flagged Events</span>
            <h3 className="text-2xl font-extrabold text-foreground">
              {trendsLoading ? '...' : trends?.totalFraudCount}
            </h3>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3.5 bg-accent/15 text-accent rounded-2xl dark:bg-accent/20">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground block uppercase">Total Exposed Capital</span>
            <h3 className="text-2xl font-extrabold text-foreground">
              {trendsLoading ? '...' : formatCurrency(trends?.totalFraudAmount)}
            </h3>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl flex items-center gap-4">
          <div className="p-3.5 bg-primary/15 text-primary rounded-2xl dark:bg-primary/20">
            <TrendingDown className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-muted-foreground block uppercase">Primary Threat Category</span>
            <h3 className="text-lg font-bold text-foreground">
              {trendsLoading ? '...' : (trends?.commonCategories[0]?.category || 'None')}
            </h3>
          </div>
        </div>
      </div>

      {/* Filter and List Section */}
      <div className="space-y-6">
        {/* Filters bar */}
        <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search description..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex w-full md:w-auto gap-3">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full md:w-48 px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none"
            >
              <option value="">All Accounts</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.bank_name} ({acc.account_number})</option>
              ))}
            </select>

            <select
              value={selectedRiskLevel}
              onChange={(e) => setSelectedRiskLevel(e.target.value)}
              className="w-full md:w-40 px-3 py-2 rounded-xl border border-border bg-background text-foreground text-xs focus:outline-none"
            >
              <option value="">All Risks</option>
              <option value="High">High Risk (&ge;70%)</option>
              <option value="Medium">Medium Risk (35-69%)</option>
            </select>
          </div>
        </div>

        {/* Flagged list grid */}
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          {loading ? (
            <p className="text-sm text-center py-12 text-muted-foreground">Scans executing...</p>
          ) : flaggedTransactions.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center space-y-3">
              <Check className="h-12 w-12 text-success border border-success/30 rounded-full p-2.5 bg-success/5 animate-pulse" />
              <div>
                <p className="font-semibold text-foreground text-base">All Clear: No Threats Found</p>
                <p className="text-xs">Any flagged transactions across statements or transfers will be recorded here.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-semibold">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Account</th>
                    <th className="pb-3 font-medium">Description</th>
                    <th className="pb-3 font-medium text-right">Amount</th>
                    <th className="pb-3 font-medium text-center">Threat Score</th>
                    <th className="pb-3 font-medium">Audit Reasoning</th>
                    <th className="pb-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {flaggedTransactions.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="py-4 text-muted-foreground">{t.date.split(' ')[0]}</td>
                      <td className="py-4 font-medium text-foreground">
                        <div>{t.bank_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{t.account_number}</div>
                      </td>
                      <td className="py-4 font-semibold text-foreground truncate max-w-[200px]" title={t.description}>
                        {t.description}
                      </td>
                      <td className="py-4 text-right text-foreground font-bold">
                        {formatCurrency(t.amount)}
                      </td>
                      <td className="py-4 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRiskBadgeColor(t.risk_score)}`}>
                          {t.risk_score}%
                        </span>
                      </td>
                      <td className="py-4 text-xs font-semibold text-foreground/80 max-w-xs leading-relaxed">
                        {t.fraud_reason || 'ML Anomaly detected'}
                      </td>
                      <td className="py-4 text-center">
                        {t.is_fraud === 0 ? (
                          <div className="flex justify-center gap-1.5">
                            <button
                              onClick={() => handleSubmitFeedback(t.id, 'confirm_fraud')}
                              className="p-1.5 bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white rounded-lg transition-all"
                              title="Confirm as Fraudulent"
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleSubmitFeedback(t.id, 'mark_safe')}
                              className="p-1.5 bg-success/10 text-success border border-success/20 hover:bg-success hover:text-white rounded-lg transition-all"
                              title="Dismiss / Mark Safe"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            t.is_fraud === 1 
                              ? 'bg-destructive/10 text-destructive border border-destructive/20' 
                              : 'bg-success/10 text-success border border-success/20'
                          }`}>
                            {t.is_fraud === 1 ? 'VERIFIED FRAUD' : 'VERIFIED SAFE'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FraudCenter;
