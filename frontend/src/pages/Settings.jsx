import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Lock, 
  BrainCircuit, 
  Cpu, 
  CheckCircle2, 
  ShieldAlert, 
  Activity, 
  History 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Settings = () => {
  const { apiCall, user } = useAuth();
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwError, setPwError] = useState('');

  // Model statistics state
  const [modelInfo, setModelInfo] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);

  // Password strength meter calculation
  const getPasswordStrength = (pwd) => {
    let score = 0;
    if (!pwd) return { score, label: 'None', color: 'bg-muted' };
    
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    
    const strengthScore = Math.min(3, Math.max(0, score - 1));
    const ratings = [
      { label: 'Weak', color: 'bg-destructive' },
      { label: 'Fair', color: 'bg-warning' },
      { label: 'Good', color: 'bg-primary' },
      { label: 'Strong', color: 'bg-success' }
    ];
    return { score: strengthScore, ...ratings[strengthScore] };
  };

  const fetchModelInfo = async () => {
    try {
      setModelLoading(true);
      const res = await apiCall('/analytics/model-info');
      if (res.ok) {
        const data = await res.json();
        setModelInfo(data);
      }
    } catch (err) {
      console.error('Failed to load ML model details:', err);
    } finally {
      setModelLoading(false);
    }
  };

  useEffect(() => {
    fetchModelInfo();
  }, []);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError('Please fill in all fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }

    const strength = getPasswordStrength(newPassword);
    if (strength.score < 2) {
      setPwError('New password is too weak. Please use a stronger password.');
      return;
    }

    setPwLoading(true);
    try {
      const res = await apiCall('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setPwSuccess(data.message);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwError(data.error || 'Failed to change password.');
      }
    } catch (err) {
      setPwError(err.message);
    } finally {
      setPwLoading(false);
    }
  };

  const pwStrength = getPasswordStrength(newPassword);

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings & Security</h1>
        <p className="text-muted-foreground text-sm">Configure authentication protocols, view session details, and audit artificial intelligence metrics.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Profile and Password Form Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Profile Overview Card */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Security Settings
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="bg-muted/40 p-4 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground block uppercase">Profile Name</span>
                <span className="font-semibold text-foreground">{user?.name || 'Administrator'}</span>
              </div>
              <div className="bg-muted/40 p-4 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground block uppercase">Email Address</span>
                <span className="font-semibold text-foreground">{user?.email || 'admin@shield.com'}</span>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="glass-panel p-6 rounded-2xl space-y-6">
            <div className="space-y-1">
              <h3 className="font-bold text-base text-foreground">Update Password Credentials</h3>
              <p className="text-xs text-muted-foreground">Passwords should consist of letters, figures, and symbols.</p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              {pwError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span>{pwError}</span>
                </div>
              )}
              {pwSuccess && (
                <div className="p-3 bg-success/10 border border-success/20 text-success text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{pwSuccess}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase">Current Password</label>
                <input 
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase">New Password</label>
                <input 
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none"
                  required
                />
                
                {/* Strength Meter Visual */}
                {newPassword && (
                  <div className="space-y-1 pt-1.5">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-muted-foreground uppercase">Strength Meter</span>
                      <span className={pwStrength.color.replace('bg-', 'text-')}>{pwStrength.label}</span>
                    </div>
                    <div className="w-full bg-muted h-1 rounded-full overflow-hidden flex gap-0.5">
                      {[...Array(4)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`h-full flex-1 rounded-full ${
                            i <= pwStrength.score ? pwStrength.color : 'bg-muted'
                          }`}
                        ></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase">Confirm New Password</label>
                <input 
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={pwLoading}
                className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/10 disabled:opacity-50"
              >
                {pwLoading ? 'Updating credentials...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>

        {/* Explainable AI & Machine Learning Stats Column */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-secondary" />
                ML Engine Audit
              </h2>
              <p className="text-muted-foreground text-xs font-medium">Explainable AI (XAI) engine statistics.</p>
            </div>

            {modelLoading ? (
              <p className="text-xs text-muted-foreground py-8 text-center">Reading model matrices...</p>
            ) : !modelInfo ? (
              <div className="p-4 bg-destructive/10 text-destructive rounded-xl text-xs flex gap-2">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <span>FastAPI scoring engine offline. Check connections.</span>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Connection Status Badge */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Scoring Link Status:</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    modelInfo.is_placeholder 
                      ? 'text-warning bg-warning/10 border-warning/20' 
                      : 'text-success bg-success/10 border-success/20'
                  }`}>
                    {modelInfo.is_placeholder ? 'DEMO MOCK FALLBACK' : 'LIVE FASTAPI'}
                  </span>
                </div>

                {/* Model score metrics */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/40 p-3.5 rounded-xl border border-border text-center">
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">Accuracy</span>
                    <span className="text-xl font-extrabold text-foreground">{(modelInfo.accuracy * 100).toFixed(1)}%</span>
                  </div>
                  <div className="bg-muted/40 p-3.5 rounded-xl border border-border text-center">
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">F1-Score</span>
                    <span className="text-xl font-extrabold text-foreground">{(modelInfo.f1_score * 100).toFixed(1)}%</span>
                  </div>
                  <div className="bg-muted/40 p-3.5 rounded-xl border border-border text-center">
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">Precision</span>
                    <span className="text-xl font-extrabold text-foreground">{(modelInfo.precision * 100).toFixed(1)}%</span>
                  </div>
                  <div className="bg-muted/40 p-3.5 rounded-xl border border-border text-center">
                    <span className="text-[10px] font-bold text-muted-foreground block uppercase">Recall</span>
                    <span className="text-xl font-extrabold text-foreground">{(modelInfo.recall * 100).toFixed(1)}%</span>
                  </div>
                </div>

                {/* Database training stats */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Cpu className="h-4 w-4" />
                      Training Samples:
                    </span>
                    <span className="font-semibold text-foreground">{modelInfo.total_samples} Txns</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Activity className="h-4 w-4" />
                      Exposed Fraud Ratio:
                    </span>
                    <span className="font-semibold text-foreground">{(modelInfo.fraud_ratio * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <History className="h-4 w-4" />
                      Last Retrained:
                    </span>
                    <span className="font-semibold text-foreground text-right">{modelInfo.last_trained_date.split(' ')[0]}</span>
                  </div>
                </div>

                {/* Explainable description text */}
                <div className="p-3 bg-secondary/10 border border-secondary/20 rounded-xl text-[10px] text-secondary-foreground leading-relaxed">
                  <span className="font-bold block mb-1">Architecture Details:</span>
                  The engine combines Isolation Forest outlier analysis (for zero-day anomalies) with an optimized Random Forest classifier (for known pattern matching). Model weights auto-adjust on user feedback confirms/dismisses.
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;
