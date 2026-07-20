import React, { useState, useEffect } from 'react';
import { CreditCard, Plus, Trash2, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Accounts = () => {
  const { apiCall } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Link Account Form State
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('Checking');
  const [routingNumber, setRoutingNumber] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formSuccess, setFormSuccess] = useState('');
  const [formError, setFormError] = useState('');

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await apiCall('/accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      } else {
        throw new Error('Failed to retrieve linked accounts.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleLinkAccount = async (e) => {
    e.preventDefault();
    setSubmitLoading(true);
    setFormError('');
    setFormSuccess('');

    if (!bankName || !accountNumber || !routingNumber) {
      setFormError('Please fill in all required fields.');
      setSubmitLoading(false);
      return;
    }

    try {
      const res = await apiCall('/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName,
          accountNumber,
          accountType,
          routingNumber,
          initialBalance: initialBalance || '0'
        })
      });

      const data = await res.json();
      if (res.ok) {
        setFormSuccess(data.message);
        // Clear fields
        setBankName('');
        setAccountNumber('');
        setRoutingNumber('');
        setInitialBalance('');
        fetchAccounts();
      } else {
        setFormError(data.error || 'Failed to link account.');
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleSetPrimary = async (accountId) => {
    try {
      const res = await apiCall(`/accounts/${accountId}/primary`, {
        method: 'PUT'
      });
      if (res.ok) {
        fetchAccounts();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to update primary account.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUnlinkAccount = async (accountId) => {
    if (!window.confirm('Are you sure you want to unlink this bank account? All associated transaction histories and statements will be deleted.')) {
      return;
    }

    try {
      const res = await apiCall(`/accounts/${accountId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchAccounts();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to unlink account.');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Linked Accounts</h1>
        <p className="text-muted-foreground text-sm">Manage your linked cards and bank account portfolios securely.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Linked Accounts Column */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Your Portfolios ({accounts.length})
          </h2>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 animate-pulse">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-44 bg-muted rounded-2xl"></div>
              ))}
            </div>
          ) : error ? (
            <div className="glass-panel p-6 rounded-2xl flex items-center gap-3 text-destructive">
              <ShieldAlert className="h-6 w-6" />
              <span>{error}</span>
            </div>
          ) : accounts.length === 0 ? (
            <div className="glass-panel p-8 text-center rounded-2xl text-muted-foreground flex flex-col items-center justify-center space-y-4">
              <CreditCard className="h-14 w-14 stroke-[1.2]" />
              <div>
                <p className="font-semibold text-foreground">No Linked Accounts Found</p>
                <p className="text-xs">Fill out the form on the right to link your first bank account.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {accounts.map((acc) => {
                // Determine card design based on type
                let cardBg = 'from-[#1e293b] to-[#0f172a] text-white';
                let typeBadgeColor = 'bg-white/20 text-white';
                let cardLogo = 'VISA';

                if (acc.account_type === 'Checking') {
                  cardBg = 'from-[#0b1b3d] via-[#1e3a8a] to-[#0b1b3d] text-white border border-blue-500/20 shadow-lg shadow-blue-900/10';
                  typeBadgeColor = 'bg-blue-500/20 text-blue-200 border border-blue-400/20';
                  cardLogo = 'VISA';
                } else if (acc.account_type === 'Savings') {
                  cardBg = 'from-[#022c22] via-[#0f766e] to-[#022c22] text-white border border-teal-500/20 shadow-lg shadow-teal-900/10';
                  typeBadgeColor = 'bg-teal-500/20 text-teal-200 border border-teal-400/20';
                  cardLogo = 'VISA DEBIT';
                } else if (acc.account_type === 'Credit Card') {
                  cardBg = 'from-[#111827] via-[#374151] to-[#111827] text-white border border-gray-700/20 shadow-lg shadow-gray-900/20';
                  typeBadgeColor = 'bg-gray-700/40 text-gray-300 border border-gray-600/20';
                  cardLogo = 'MASTERCARD';
                } else if (acc.account_type === 'Investment') {
                  cardBg = 'from-[#2e1065] via-[#6b21a8] to-[#2e1065] text-white border border-purple-500/20 shadow-lg shadow-purple-900/10';
                  typeBadgeColor = 'bg-purple-500/25 text-purple-200 border border-purple-400/20';
                  cardLogo = 'SHIELD INV';
                }

                const primaryGlow = acc.is_primary === 1 
                  ? 'ring-2 ring-accent ring-offset-2 ring-offset-background scale-[1.01]' 
                  : 'hover:scale-[1.005]';

                return (
                  <div 
                    key={acc.id} 
                    className={`relative p-6 rounded-2xl bg-gradient-to-br transition-all duration-300 flex flex-col justify-between min-h-[230px] ${cardBg} ${primaryGlow}`}
                  >
                    {/* Background Grid Overlay */}
                    <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none rounded-2xl"></div>

                    {/* Top Row: Bank Info and Primary indicator */}
                    <div className="flex justify-between items-start z-10">
                      <div>
                        <h3 className="font-extrabold text-base tracking-tight uppercase">{acc.bank_name}</h3>
                        <span className={`text-[8px] uppercase font-extrabold px-2 py-0.5 rounded-full mt-1.5 inline-block tracking-wider ${typeBadgeColor}`}>
                          {acc.account_type}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        {acc.is_primary === 1 && (
                          <span className="text-[8px] font-extrabold bg-accent text-accent-foreground px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                            <Sparkles className="h-3 w-3" />
                            PRIMARY
                          </span>
                        )}
                        <span className="font-mono font-bold text-[10px] tracking-wider opacity-60">{cardLogo}</span>
                      </div>
                    </div>

                    {/* Middle Row: Chip and routing number */}
                    <div className="flex items-center gap-4 my-2.5 z-10">
                      {/* Sim Chip Graphic */}
                      <div className="w-9 h-6.5 bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-200 rounded-md border border-yellow-500/20 relative shadow-inner overflow-hidden opacity-90 shrink-0">
                        <div className="absolute inset-x-3 inset-y-0 border-l border-r border-yellow-600/30"></div>
                        <div className="absolute inset-y-2 inset-x-0 border-t border-b border-yellow-600/30"></div>
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-yellow-600/30"></div>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[8px] text-white/50 block font-semibold uppercase tracking-wider">Routing Number</span>
                        <span className="text-xs text-white/90 font-mono tracking-wider truncate block">
                          {acc.routing_number || 'N/A (Credit Card Account)'}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Row: Balance, Masked Numbers, Action Controls */}
                    <div className="space-y-3.5 z-10">
                      <div className="flex justify-between items-end">
                        <div>
                          <span className="text-[8px] text-white/50 block font-semibold uppercase tracking-wider">Account Number</span>
                          <span className="font-mono text-sm tracking-widest text-white/95 block">
                            {acc.account_number}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[8px] text-white/50 block font-semibold uppercase tracking-wider">Available Balance</span>
                          <span className="text-lg font-extrabold text-white tracking-tight">{formatCurrency(acc.balance)}</span>
                        </div>
                      </div>

                      {/* Card Action footer row */}
                      <div className="pt-2.5 border-t border-white/10 flex justify-between items-center">
                        <div className="text-[8px] text-white/40 font-bold uppercase tracking-wider">
                          Verified Portfolio
                        </div>
                        <div className="flex items-center gap-1.5">
                          {acc.is_primary === 0 && (
                            <button 
                              onClick={() => handleSetPrimary(acc.id)}
                              className="text-[9px] font-extrabold px-2.5 py-1 rounded-lg bg-white text-[#0f172a] hover:bg-white/95 transition-all shadow-sm"
                            >
                              Make Primary
                            </button>
                          )}
                          <button 
                            onClick={() => handleUnlinkAccount(acc.id)}
                            className="p-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 text-red-100 hover:text-white transition-all border border-red-500/25"
                            title="Unlink Account"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Account Column */}
        <div className="glass-panel p-6 rounded-2xl h-fit space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Link New Bank</h2>
            <p className="text-muted-foreground text-xs font-medium">Verify credentials to map account balances.</p>
          </div>

          <form onSubmit={handleLinkAccount} className="space-y-4">
            {formError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                <span>{formError}</span>
              </div>
            )}
            {formSuccess && (
              <div className="p-3 bg-success/10 border border-success/20 text-success text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>{formSuccess}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Bank Name *</label>
              <input 
                type="text" 
                placeholder="e.g. Chase Bank, Barclays" 
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Account Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="Checking">Checking Account</option>
                <option value="Savings">Savings Account</option>
                <option value="Credit Card">Credit Card Account</option>
                <option value="Investment">Investment Portfolio</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Account Number *</label>
              <input 
                type="text" 
                placeholder="Enter raw digits" 
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Routing Number / IFSC *</label>
              <input 
                type="text" 
                placeholder="e.g. 021000021 / BARC010203" 
                value={routingNumber}
                onChange={(e) => setRoutingNumber(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Initial Balance (₹)</label>
              <input 
                type="number" 
                placeholder="e.g. 5000" 
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                min="0"
                step="0.01"
              />
            </div>

            <button
              type="submit"
              disabled={submitLoading}
              className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/10 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Plus className="h-4.5 w-4.5" />
              {submitLoading ? 'Linking Account...' : 'Link Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Accounts;
