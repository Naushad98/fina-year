import React, { useState } from 'react';
import { Shield, Lock, Mail, ShieldAlert, KeyRound, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Login = ({ onToggleView }) => {
  const { login, verifyOTP } = useAuth();
  
  // Inputs state
  const [email, setEmail] = useState(localStorage.getItem('rememberedEmail') || '');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  
  // Interface states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // 2FA session variables
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setLoading(true);
    try {
      const data = await login(email, password);
      localStorage.setItem('rememberedEmail', email);
      if (data.requires2FA) {
        setRequires2FA(true);
        setTempToken(data.tempToken);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (otp.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      await verifyOTP(tempToken, otp);
      // AuthContext will handle token storage and trigger rerender to authenticated view
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-6 relative overflow-hidden transition-colors duration-300">
      
      {/* Visual background lights */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-primary/5 blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-secondary/5 blur-[150px] pointer-events-none"></div>

      <div className="w-full max-w-md space-y-8 relative z-10">
        
        {/* Brand Logo Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center dark:bg-primary/20 shadow-md shadow-primary/5">
            <Shield className="h-6 w-6 stroke-[2]" />
          </div>
          <div>
            <h1 className="font-extrabold text-2xl tracking-tight text-foreground">FraudShield Platform</h1>
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mt-1">Bank-Grade Account Auditing</p>
          </div>
        </div>

        {/* Auth Box Container */}
        <div className="glass-panel p-8 rounded-2xl space-y-6">
          
          <h2 className="text-lg font-bold text-foreground text-center">
            {requires2FA ? 'Verification Required' : 'Account Authorization'}
          </h2>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-2">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!requires2FA ? (
            // Phase 1: Credentials Form
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    placeholder="name@organization.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Password</label>
                  <a href="#forgot" className="text-[10px] text-primary font-bold hover:underline" onClick={(e) => { e.preventDefault(); alert("Forgot password link sent to mock console."); }}>
                    Forgot Password?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/10 flex items-center justify-center disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          ) : (
            // Phase 2: OTP Verification Form
            <form onSubmit={handleOTPSubmit} className="space-y-5">
              <div className="space-y-2 text-center">
                <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                  A verification code has been dispatched. Enter the 6-digit code to authorize this session.
                </p>
                <div className="p-3 bg-success/5 border border-success/10 text-success text-xs rounded-xl flex items-start gap-2.5 text-left max-w-sm mx-auto">
                  <Mail className="h-5 w-5 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    <strong>Check your Inbox:</strong> A 6-digit verification code has been sent to your registered Gmail address.
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block text-center">One-Time Code (2FA)</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-36 mx-auto px-4 py-3 rounded-xl border border-border bg-background text-foreground text-xl text-center focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono tracking-widest block"
                  required
                />
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-xl text-sm hover:bg-primary/95 transition-all shadow-md shadow-primary/10 flex items-center justify-center disabled:opacity-50"
                >
                  {loading ? 'Verifying Code...' : 'Authorize Session'}
                </button>
                <button
                  type="button"
                  onClick={() => setRequires2FA(false)}
                  className="w-full py-2 bg-transparent text-muted-foreground hover:text-foreground text-xs font-semibold transition-all"
                >
                  Back to credentials
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Toggle View Footer link */}
        <p className="text-center text-xs text-muted-foreground font-medium">
          {requires2FA ? '' : (
            <>
              Don't have an audit profile?{' '}
              <button onClick={onToggleView} className="text-primary font-bold hover:underline">
                Create Account
              </button>
            </>
          )}
        </p>

      </div>
    </div>
  );
};

export default Login;
