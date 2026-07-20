import React, { useState, useEffect } from 'react';
import { 
  Send, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Clock, 
  ArrowRight,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Transfer = () => {
  const { apiCall } = useAuth();
  
  // Accounts state
  const [accounts, setAccounts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form inputs
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountName, setToAccountName] = useState('');
  const [toAccountNumber, setToAccountNumber] = useState('');
  const [toRoutingNumber, setToRoutingNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Risk pre-check state
  const [riskCheckLoading, setRiskCheckLoading] = useState(false);
  const [riskAnalysis, setRiskAnalysis] = useState(null);
  const [riskError, setRiskError] = useState('');

  // Transaction execution state
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideCheckbox, setOverrideCheckbox] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [executionError, setExecutionError] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const accRes = await apiCall('/accounts');
      const transRes = await apiCall('/transfers');
      
      if (accRes.ok && transRes.ok) {
        const accs = await accRes.json();
        const trs = await transRes.json();
        
        setAccounts(accs);
        setTransfers(trs);
        
        // Default fromAccountId to primary card
        const primary = accs.find(a => a.is_primary === 1);
        if (primary) {
          setFromAccountId(primary.id);
        } else if (accs.length > 0) {
          setFromAccountId(accs[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load transfer page data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Pre-scoring risk analysis handler
  const checkTransactionRisk = async () => {
    setRiskError('');
    setRiskAnalysis(null);

    if (!fromAccountId || !toAccountName || !toAccountNumber || !toRoutingNumber || !amount) {
      setRiskError('Please complete all form fields to run risk scoring.');
      return;
    }

    const amtVal = parseFloat(amount);
    if (isNaN(amtVal) || amtVal <= 0) {
      setRiskError('Please enter a valid positive transfer amount.');
      return;
    }

    setRiskCheckLoading(true);
    try {
      const res = await apiCall('/transfers/check-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId,
          toAccountName,
          toAccountNumber,
          toRoutingNumber,
          amount: amtVal
        })
      });

      const data = await res.json();
      if (res.ok) {
        setRiskAnalysis(data);
      } else {
        setRiskError(data.error || 'Failed to analyze risk score.');
      }
    } catch (err) {
      setRiskError(err.message);
    } finally {
      setRiskCheckLoading(false);
    }
  };

  // Final execution handler
  const handleInitiateTransfer = async (isOverride = false) => {
    setExecutionError('');
    setSuccessMessage('');
    setSubmitLoading(true);

    try {
      const res = await apiCall('/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId,
          toAccountName,
          toAccountNumber,
          toRoutingNumber,
          amount: parseFloat(amount),
          note,
          overrideConfirmed: isOverride
        })
      });

      const data = await res.json();

      if (res.status === 202 && data.requires_override) {
        // High/Medium risk warning triggered, launch warning confirmation
        setRiskAnalysis({
          risk_score: data.risk_score,
          risk_level: data.risk_level,
          reasons: data.reasons
        });
        setShowOverrideModal(true);
        setSubmitLoading(false);
        return;
      }

      if (res.ok) {
        setSuccessMessage(data.message);
        setToAccountName('');
        setToAccountNumber('');
        setToRoutingNumber('');
        setAmount('');
        setNote('');
        setRiskAnalysis(null);
        setShowOverrideModal(false);
        setOverrideCheckbox(false);
        loadData(); // refresh history & balances
      } else {
        setExecutionError(data.error || 'Transaction execution failed.');
      }
    } catch (err) {
      setExecutionError(err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const getRiskScoreColor = (level) => {
    if (level === 'Low') return 'border-success bg-success/5 text-success';
    if (level === 'Medium') return 'border-warning bg-warning/5 text-warning';
    return 'border-destructive bg-destructive/5 text-destructive glow-red animate-pulse-slow';
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Transfer Funds</h1>
        <p className="text-muted-foreground text-sm">Send domestic/international wire payments evaluated by the FraudShield ML service.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Transfer Form Column */}
        <div className="glass-panel p-6 rounded-2xl h-fit space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Recipient Details</h2>
            <p className="text-muted-foreground text-xs">Ensure correct banking coordinates before validation.</p>
          </div>

          <div className="space-y-4">
            {executionError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                <span>{executionError}</span>
              </div>
            )}
            {successMessage && (
              <div className="p-3 bg-success/10 border border-success/20 text-success text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Originating Account */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">From Account</label>
              <select
                value={fromAccountId}
                onChange={(e) => {
                  setFromAccountId(e.target.value);
                  setRiskAnalysis(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.bank_name} - {acc.account_number} ({formatCurrency(acc.balance)})
                  </option>
                ))}
              </select>
            </div>

            {/* Recipient Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Beneficiary Name</label>
              <input 
                type="text" 
                placeholder="Full Name" 
                value={toAccountName}
                onChange={(e) => {
                  setToAccountName(e.target.value);
                  setRiskAnalysis(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            {/* Recipient Account Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Account Number</label>
              <input 
                type="text" 
                placeholder="Beneficiary Bank digits" 
                value={toAccountNumber}
                onChange={(e) => {
                  setToAccountNumber(e.target.value.replace(/\D/g, ''));
                  setRiskAnalysis(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                required
              />
            </div>

            {/* Routing Number */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">IFSC / Routing / Swift</label>
              <input 
                type="text" 
                placeholder="e.g. IFSC/Routing code" 
                value={toRoutingNumber}
                onChange={(e) => {
                  setToRoutingNumber(e.target.value.toUpperCase());
                  setRiskAnalysis(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                required
              />
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Transfer Amount (₹)</label>
              <input 
                type="number" 
                placeholder="0.00" 
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setRiskAnalysis(null);
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold"
                min="0.01"
                step="0.01"
                required
              />
            </div>

            {/* Memo */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Transaction Memo</label>
              <input 
                type="text" 
                placeholder="Note / Reference" 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Risk Check & Submit Trigger Buttons */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={checkTransactionRisk}
                disabled={riskCheckLoading}
                className="w-full py-2.5 bg-muted text-foreground border border-border rounded-xl font-semibold text-xs hover:bg-muted/80 transition-all flex items-center justify-center gap-2"
              >
                {riskCheckLoading ? 'Scoring Transfer Risk...' : 'Run Risk Check Engine'}
              </button>

              <button
                type="button"
                onClick={() => handleInitiateTransfer(false)}
                disabled={submitLoading || accounts.length === 0}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/10 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="h-4.5 w-4.5" />
                {submitLoading ? 'Initiating Wire...' : 'Authorize Transfer'}
              </button>
            </div>
          </div>
        </div>

        {/* Risk Analysis Display Column */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-foreground">Risk Scoring Center</h2>
          
          {riskError && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <span>{riskError}</span>
            </div>
          )}

          {!riskAnalysis && !riskError && (
            <div className="glass-panel p-8 text-center rounded-2xl text-muted-foreground flex flex-col items-center justify-center py-20 space-y-4">
              <UserCheck className="h-16 w-16 stroke-[1.2] text-primary/30" />
              <div>
                <p className="font-semibold text-foreground text-base">Risk scoring pending</p>
                <p className="text-xs max-w-sm mt-1">Provide beneficiary and amount details and click 'Run Risk Check Engine' to verify compliance before sending.</p>
              </div>
            </div>
          )}

          {riskAnalysis && (
            <div className={`p-6 rounded-2xl border transition-all duration-300 ${getRiskScoreColor(riskAnalysis.risk_level)}`}>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border/10 pb-4 mb-6">
                <div>
                  <h3 className="font-bold text-xl flex items-center gap-2 text-foreground">
                    {riskAnalysis.risk_level === 'Low' && <CheckCircle2 className="h-6 w-6 text-success" />}
                    {riskAnalysis.risk_level === 'Medium' && <AlertTriangle className="h-6 w-6 text-warning" />}
                    {riskAnalysis.risk_level === 'High' && <ShieldAlert className="h-6 w-6 text-destructive" />}
                    {riskAnalysis.risk_level} Risk Level
                  </h3>
                  <p className="text-muted-foreground text-xs font-medium">Scored by FraudShield Anomaly Engine</p>
                </div>
                
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider block text-muted-foreground">Confidence Score</span>
                  <span className="text-3xl font-extrabold text-foreground">{riskAnalysis.risk_score}%</span>
                </div>
              </div>

              {/* Explanations List */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-foreground block">Explainable AI (XAI) Audit Reasoning:</span>
                <ul className="space-y-2">
                  {riskAnalysis.reasons.map((reason, idx) => (
                    <li key={idx} className="text-xs flex items-start gap-2 text-foreground/80 leading-relaxed font-medium">
                      <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Transfers History */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              Transfer Registers
            </h2>

            {transfers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No wire histories recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-semibold">
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">To Account</th>
                      <th className="pb-3 font-medium text-right">Amount</th>
                      <th className="pb-3 font-medium text-right">Risk Score</th>
                      <th className="pb-3 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {transfers.map((tr) => (
                      <tr key={tr.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 text-muted-foreground">{tr.created_at.split(' ')[0]}</td>
                        <td className="py-3 font-semibold text-foreground truncate max-w-[150px]">
                          <div>{tr.to_account_name}</div>
                          <div className="text-[10px] text-muted-foreground font-normal">{tr.to_account_number}</div>
                        </td>
                        <td className="py-3 text-right font-bold text-foreground">
                          {formatCurrency(tr.amount)}
                        </td>
                        <td className="py-3 text-right font-semibold text-muted-foreground">{tr.risk_score}%</td>
                        <td className="py-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            tr.status === 'Success' 
                              ? 'text-success bg-success/10 border-success/20' 
                              : (tr.status === 'Pending' ? 'text-warning bg-warning/10 border-warning/20' : 'text-destructive bg-destructive/10 border-destructive/20')
                          }`}>
                            {tr.status.toUpperCase()}
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
      </div>

      {/* Safety Override Confirmation Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 space-y-6 glow-red">
            <div className="flex items-center gap-3 text-destructive">
              <ShieldAlert className="h-8 w-8 shrink-0 animate-bounce" />
              <div>
                <h3 className="font-bold text-lg text-foreground">High Risk Override Requested</h3>
                <span className="text-[10px] font-semibold text-muted-foreground">Transaction ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
              </div>
            </div>

            <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl text-xs space-y-3">
              <p className="font-semibold text-foreground">The transaction score is {riskAnalysis?.risk_score}% ({riskAnalysis?.risk_level} Risk). Standard processing is locked.</p>
              <div className="space-y-1">
                <span className="font-bold text-foreground block">Anomaly reasons detected:</span>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {riskAnalysis?.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            </div>

            {/* Checkbox confirmation */}
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={overrideCheckbox}
                onChange={(e) => setOverrideCheckbox(e.target.checked)}
                className="mt-0.5 rounded border-border text-primary focus:ring-primary/20 h-4 w-4"
              />
              <span className="text-xs text-foreground font-semibold leading-relaxed">
                I verify that I want to send {formatCurrency(amount)} to {toAccountName} A/C {toAccountNumber}. I accept full security liability for bypassing automatic risk triggers.
              </span>
            </label>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowOverrideModal(false);
                  setOverrideCheckbox(false);
                }}
                className="flex-1 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted font-semibold text-xs transition-all"
              >
                Cancel and Revoke
              </button>

              <button
                type="button"
                disabled={!overrideCheckbox || submitLoading}
                onClick={() => handleInitiateTransfer(true)}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold text-xs shadow-md shadow-destructive/10 transition-all disabled:opacity-40"
              >
                Confirm and Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transfer;
