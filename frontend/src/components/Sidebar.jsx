import React from 'react';
import { 
  LayoutDashboard, 
  CreditCard, 
  Send, 
  FileText, 
  ShieldAlert, 
  Settings, 
  LogOut,
  Sun,
  Moon,
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ activeTab, setActiveTab, darkMode, setDarkMode }) => {
  const { user, logout } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'accounts', label: 'Linked Accounts', icon: CreditCard },
    { id: 'transfer', label: 'Transfer Money', icon: Send },
    { id: 'statements', label: 'Statements', icon: FileText },
    { id: 'fraud', label: 'Fraud Center', icon: ShieldAlert },
    { id: 'settings', label: 'Settings & Security', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border h-screen flex flex-col justify-between transition-colors duration-300">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="bg-primary/10 text-primary p-2 rounded-lg dark:bg-primary/20">
            <Shield className="h-6 w-6 stroke-[2]" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight text-foreground">FraudShield</h1>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Academic Edition</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="p-4 space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10 dark:shadow-none' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Actions Footer */}
      <div className="p-4 border-t border-border space-y-4">
        {/* Theme Toggle & User Info */}
        <div className="flex items-center justify-between px-2">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
              {user?.name || 'Administrator'}
            </span>
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {user?.email || 'admin@shield.com'}
            </span>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
            title="Toggle theme"
          >
            {darkMode ? <Sun className="h-4 w-4 text-accent" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-xl transition-all duration-200"
        >
          <LogOut className="h-4.5 w-4.5" />
          Log Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
