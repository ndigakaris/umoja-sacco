/**
 * Auth Context — manages user session, tokens, login/logout state
 * Wrap <App /> with <AuthProvider /> in index.js
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount — restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('umoja_user');
    const token = localStorage.getItem('umoja_token');
    if (stored && token) {
      setUser(JSON.parse(stored));
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const { user, accessToken, refreshToken } = data.data;

    localStorage.setItem('umoja_user', JSON.stringify(user));
    localStorage.setItem('umoja_token', accessToken);
    localStorage.setItem('umoja_refresh', refreshToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('umoja_refresh');
    try { await api.post('/auth/logout', { refreshToken }); } catch (_) {}
    localStorage.removeItem('umoja_user');
    localStorage.removeItem('umoja_token');
    localStorage.removeItem('umoja_refresh');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles) => {
    return user && roles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
