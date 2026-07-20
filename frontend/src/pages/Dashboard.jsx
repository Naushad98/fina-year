import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  CreditCard, 
  ShieldAlert, 
  Activity, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Upload, 
  PlusCircle, 
  Send 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import { useAuth } from '../context/AuthContext';

const Dashboard = ({ setActiveTab }) => {
  const { apiCall } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await apiCall('/analytics/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        throw new Error('Failed to load dashboard data.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="p-8 space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-muted rounded-lg"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-2xl"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-80 bg-muted rounded-2xl lg:col-span-2"></div>
          <div className="h-80 bg-muted rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center space-y-4">
        <ShieldAlert className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-bold text-foreground">Failed to Load Dashboard</h2>
        <p className="text-muted-foreground max-w-md">{error}</p>
        <button onClick={fetchDashboardData} className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-medium">
          Retry Connection
        </button>
      </div>
    );
  }

  const { summary, spendingBreakdown, balanceHistory, recentTransactions } = data;

  const COLORS = ['#0ea5e9', '#0d9488', '#f59e0b', '#e11d48', '#8b5cf6', '#3b82f6', '#10b981', '#6b7280'];

  const getRiskColor = (score) => {
    if (score < 35.0) return 'text-success bg-success/10 border-success/20';
    if (score < 70.0) return 'text-warning bg-warning/10 border-warning/20';
    return 'text-destructive bg-destructive/10 border-destructive/20';
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Financial Overview</h1>
          <p className="text-muted-foreground text-sm">Real-time status updates and machine learning risk monitoring.</p>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3">
          <button 
            onClick={() => setActiveTab('accounts')}
            className="flex items-center gap-2 px-4 py-2.5 bg-muted text-foreground border border-border rounded-xl font-medium text-sm hover:bg-muted/80 transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            Add Account
          </button>
          <button 
            onClick={() => setActiveTab('statements')}
            className="flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium text-sm hover:bg-secondary/90 transition-all shadow-md shadow-secondary/15"
          >
            <Upload className="h-4 w-4" />
            Upload Statement
          </button>
          <button 
            onClick={() => setActiveTab('transfer')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/15"
          >
            <Send className="h-4 w-4" />
            Transfer Money
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Balance */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-center text-muted-foreground mb-4">
            <span className="text-sm font-medium">Total Balance</span>
            <div className="p-2 bg-primary/10 text-primary rounded-lg dark:bg-primary/20">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground truncate">{formatCurrency(summary.totalBalance)}</h3>
            <span className="text-xs text-success font-medium">All linked accounts consolidated</span>
          </div>
        </div>

        {/* Accounts Count */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-center text-muted-foreground mb-4">
            <span className="text-sm font-medium">Linked Accounts</span>
            <div className="p-2 bg-secondary/10 text-secondary rounded-lg dark:bg-secondary/20">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">{summary.totalAccounts}</h3>
            <span className="text-xs text-muted-foreground">Primary card active</span>
          </div>
        </div>

        {/* Fraud Alerts */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-center text-muted-foreground mb-4">
            <span className="text-sm font-medium">Fraud Warnings</span>
            <div className="p-2 bg-destructive/10 text-destructive rounded-lg dark:bg-destructive/20">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">{summary.fraudAlerts}</h3>
            <span className="text-xs text-destructive font-medium">Requires immediate resolution</span>
          </div>
        </div>

        {/* Safety Risk Score */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div className="flex justify-between items-center text-muted-foreground mb-4">
            <span className="text-sm font-medium">Security Risk Score</span>
            <div className="p-2 bg-accent/10 text-accent rounded-lg dark:bg-accent/20">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-2xl font-bold text-foreground">{summary.overallRiskScore}%</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRiskColor(summary.overallRiskScore)}`}>
                {summary.overallRiskScore < 35.0 ? 'LOW' : (summary.overallRiskScore < 70.0 ? 'MODERATE' : 'CRITICAL')}
              </span>
            </div>
            <div className="w-full bg-muted h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  summary.overallRiskScore < 35.0 ? 'bg-success' : (summary.overallRiskScore < 70.0 ? 'bg-warning' : 'bg-destructive')
                }`}
                style={{ width: `${summary.overallRiskScore}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Balance Trend Line */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-foreground">Account Assets Trend</h2>
            <span className="text-xs text-muted-foreground">Rolling statement period</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balanceHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="balanceColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(200,200,200,0.15)"/>
                <XAxis dataKey="date" stroke="currentColor" className="text-muted-foreground text-[10px]" tickLine={false}/>
                <YAxis stroke="currentColor" className="text-muted-foreground text-[10px]" tickLine={false} tickFormatter={(v) => `$${v}`}/>
                <Tooltip 
                  formatter={(value) => [formatCurrency(value), 'Balance']}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }}
                  labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="balance" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#balanceColor)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Spending Breakdown */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">Spending Categorization</h2>
            <p className="text-muted-foreground text-xs">Debit distribution profile.</p>
          </div>
          
          {spendingBreakdown.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <span className="text-muted-foreground text-xs">No debit activity logged.</span>
            </div>
          ) : (
            <>
              <div className="h-56 relative flex justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={spendingBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="category"
                    >
                      {spendingBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val) => formatCurrency(val)}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 text-[10px] text-muted-foreground max-h-16 overflow-y-auto">
                {spendingBreakdown.map((entry, index) => (
                  <div key={entry.category} className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="font-medium text-foreground">{entry.category}</span>
                    <span>({formatCurrency(entry.value)})</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Recent Transactions List */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-foreground">Recent Activity</h2>
            <p className="text-muted-foreground text-xs">Most recent transactions across linked portfolios.</p>
          </div>
          <button onClick={() => setActiveTab('statements')} className="text-xs text-primary font-medium hover:underline">
            View Statements
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center space-y-2">
            <ShieldAlert className="h-10 w-10 stroke-[1.2]" />
            <p className="text-sm">No transaction entries found.</p>
            <p className="text-xs">Upload a statement to populate transaction registers.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs font-semibold">
                  <th className="pb-3 font-medium">Date</th>
                  <th className="pb-3 font-medium">Description</th>
                  <th className="pb-3 font-medium">Category</th>
                  <th className="pb-3 font-medium text-right">Amount</th>
                  <th className="pb-3 font-medium text-right">Risk Score</th>
                  <th className="pb-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentTransactions.map((txn) => (
                  <tr key={txn.id} className="group hover:bg-muted/30 transition-colors">
                    <td className="py-3.5 text-xs text-muted-foreground font-medium">{txn.date.split(' ')[0]}</td>
                    <td className="py-3.5 font-semibold text-foreground max-w-xs truncate" title={txn.description}>
                      {txn.description}
                    </td>
                    <td className="py-3.5">
                      <span className="text-[10px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {txn.category}
                      </span>
                    </td>
                    <td className={`py-3.5 text-right font-bold ${txn.type === 'credit' ? 'text-success' : 'text-foreground'}`}>
                      <div className="flex justify-end items-center gap-1 text-right">
                        {txn.type === 'credit' ? (
                          <ArrowDownLeft className="h-3 w-3 stroke-[2.5]" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3 text-muted-foreground stroke-[2.5]" />
                        )}
                        {formatCurrency(txn.amount)}
                      </div>
                    </td>
                    <td className="py-3.5 text-right font-semibold text-xs text-muted-foreground">{txn.risk_score}%</td>
                    <td className="py-3.5 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRiskColor(txn.risk_score)}`}>
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
  );
};

export default Dashboard;
