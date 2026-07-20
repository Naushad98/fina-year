import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);
const API_URL = 'http://localhost:5000/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('fs_token') || null);
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('fs_refresh') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if token exists on boot
    const storedUser = localStorage.getItem('fs_user');
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        logout();
      }
    }
    setLoading(false);
  }, [token]);

  const login = async (email, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed.');
    }
    return data; // Returns { tempToken, requires2FA }
  };

  const verifyOTP = async (tempToken, otp) => {
    const res = await fetch(`${API_URL}/auth/login/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken, otp })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Verification failed.');
    }

    // Set authentication tokens
    localStorage.setItem('fs_token', data.token);
    localStorage.setItem('fs_refresh', data.refreshToken);
    localStorage.setItem('fs_user', JSON.stringify(data.user));
    
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    return data.user;
  };

  const signup = async (name, email, password) => {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Signup failed.');
    }
    return data;
  };

  const logout = () => {
    localStorage.removeItem('fs_token');
    localStorage.removeItem('fs_refresh');
    localStorage.removeItem('fs_user');
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  // Helper API fetch wrapper that handles auth header injection and auto-refreshes/logouts on 401/403
  const apiCall = async (endpoint, options = {}) => {
    const headers = options.headers || {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers
    };

    let response = await fetch(`${API_URL}${endpoint}`, config);

    // If token expired, try to refresh it
    if ((response.status === 401 || response.status === 403) && refreshToken) {
      try {
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });
        
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          localStorage.setItem('fs_token', refreshData.token);
          setToken(refreshData.token);
          
          // Retry original request with new token
          config.headers['Authorization'] = `Bearer ${refreshData.token}`;
          response = await fetch(`${API_URL}${endpoint}`, config);
        } else {
          logout();
          throw new Error('Session expired. Please log in again.');
        }
      } catch (err) {
        logout();
        throw new Error('Session expired. Please log in again.');
      }
    }

    return response;
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!token, loading, login, verifyOTP, signup, logout, apiCall }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
