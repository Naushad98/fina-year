import React, { useState } from 'react';
import { Shield, Lock, Mail, User, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Signup = ({ onToggleView }) => {
  const { signup } = useAuth();
  
  // Inputs state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Interface states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const strength = getPasswordStrength(password);
    if (strength.score < 2) {
      setError('Password is too weak. Please use at least 8 characters and include mix of numbers/symbols.');
      return;
    }

    setLoading(true);
    try {
      const data = await signup(name, email, password);
      setSuccess(data.message || 'Registration successful! Directing to login...');
      // Clear fields
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      // Delay transition to let user read success message
      setTimeout(() => {
        onToggleView();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = getPasswordStrength(password);

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
          
          <h2 className="text-lg font-bold text-foreground text-center">Create Audit Profile</h2>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-xl flex items-center gap-2">
              <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 bg-success/10 border border-success/20 text-success text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSignupSubmit} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
            </div>

            {/* Email Address */}
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

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Password</label>
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
              
              {/* Strength Meter Visual */}
              {password && (
                <div className="space-y-1 pt-1.5">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-muted-foreground uppercase">Password Complexity</span>
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

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Verify Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
              {loading ? 'Creating Profile...' : 'Sign Up'}
            </button>
          </form>

        </div>

        {/* Toggle View Footer link */}
        <p className="text-center text-xs text-muted-foreground font-medium">
          Already have an audit profile?{' '}
          <button onClick={onToggleView} className="text-primary font-bold hover:underline">
            Sign In
          </button>
        </p>

      </div>
    </div>
  );
};

export default Signup;
