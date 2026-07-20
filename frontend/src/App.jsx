import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transfer from './pages/Transfer';
import Statements from './pages/Statements';
import FraudCenter from './pages/FraudCenter';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { Shield } from 'lucide-react';

const AppContent = () => {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authView, setAuthView] = useState('login'); // 'login' | 'signup'
  
  // Theme state: dark mode active by default for premium bank look
  const [darkMode, setDarkMode] = useState(true);

  // Sync theme class with document root
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center text-center space-y-4">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Securing Audit Session...</p>
      </div>
    );
  }

  // Unauthenticated Portal View
  if (!isAuthenticated) {
    return authView === 'login' ? (
      <Login onToggleView={() => setAuthView('signup')} />
    ) : (
      <Signup onToggleView={() => setAuthView('login')} />
    );
  }

  // Authenticated Dashboard Shell View
  return (
    <div className="flex h-screen bg-background overflow-hidden transition-colors duration-300">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        darkMode={darkMode} 
        setDarkMode={setDarkMode} 
      />

      {/* Main Body view ports */}
      <main className="flex-1 overflow-y-auto bg-background transition-colors duration-300">
        
        {/* Banner Alert simulating high-level security */}
        <div className="bg-primary/5 border-b border-border py-2 px-8 flex justify-between items-center text-[10px] text-muted-foreground font-semibold tracking-wide select-none">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 bg-success rounded-full animate-pulse"></span>
            <span>HYBRID ANOMALY ENGINE STATUS: SYNCED</span>
          </div>
          <span className="hidden sm:inline">SECURE CLIENT DATA IS ENCRYPTED END-TO-END</span>
        </div>

        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'accounts' && <Accounts />}
        {activeTab === 'transfer' && <Transfer />}
        {activeTab === 'statements' && <Statements />}
        {activeTab === 'fraud' && <FraudCenter />}
        {activeTab === 'settings' && <Settings />}
      </main>
    </div>
  );
};

// Wrap AppContent with AuthProvider Context
const App = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
