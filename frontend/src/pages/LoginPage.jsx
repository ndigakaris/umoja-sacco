/**
 * Login Page — JWT auth with form validation
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.role === 'member' ? '/dashboard' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="font-display font-semibold text-3xl text-white mb-1">
            Umoja<span className="text-[#5BC4A0]">SACCO</span>
          </div>
          <p className="text-white/60 text-sm">SASRA Regulated · Member Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="font-display font-semibold text-xl text-gray-900 mb-6">Sign in to your account</h1>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Email Address</label>
              <input
                name="email" type="email" required value={form.email} onChange={handleChange}
                placeholder="you@example.com"
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Password</label>
              <div className="relative">
                <input
                  name="password" type={showPassword ? 'text' : 'password'} required value={form.password} onChange={handleChange}
                  placeholder="Enter your password"
                  className="w-full h-10 px-3 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600 transition-colors"
                />
                <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    {showPassword
                      ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                    }
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full h-10 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-xs text-gray-400">
              New member?{' '}
              <Link to="/register" className="text-primary-600 hover:text-primary-500 font-medium">Apply for membership</Link>
            </p>
          </div>

          {/* Dev hint */}
          <div className="mt-6 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-400 font-medium mb-1">Quick login (demo)</p>
            <div className="space-y-1">
              {[
                ['Admin', 'admin@umojasacco.co.ke', 'Admin@1234'],
                ['Treasurer', 'treasurer@umojasacco.co.ke', 'Treasurer@1234'],
              ].map(([role, email, pw]) => (
                <button key={role} type="button" onClick={() => setForm({ email, password: pw })}
                  className="w-full text-left text-xs text-primary-600 hover:text-primary-500 py-0.5">
                  {role}: {email}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-white/40 text-xs mt-6">
          © {new Date().getFullYear()} UmojaSACCO Society Ltd · CS/SACCO/2010/001234
        </p>
      </div>
    </div>
  );
}
