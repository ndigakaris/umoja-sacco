/**
 * Savings & Shares Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate, getInitials } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

function RecordContributionModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ user_id: '', amount: '', account_type: 'savings', description: '' });
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/members', { params: { limit: 100, status: 'active' } }).then(r => setMembers(r.data.data || [])).catch(() => {});
  }, []);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/accounts/deposit', form);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record contribution');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-gray-900">Record Contribution</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Member *</label>
            <select name="user_id" required value={form.user_id} onChange={handleChange}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 bg-white">
              <option value="">Select member...</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.full_name} — {m.member_no}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Account Type *</label>
              <select name="account_type" value={form.account_type} onChange={handleChange}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 bg-white">
                <option value="savings">Savings</option>
                <option value="shares">Shares</option>
                <option value="welfare">Welfare</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount (KES) *</label>
              <input name="amount" type="number" required value={form.amount} onChange={handleChange} placeholder="e.g. 5000"
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <input name="description" value={form.description} onChange={handleChange} placeholder="e.g. Monthly contribution - Jan 2026"
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 h-10 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg disabled:opacity-60">
              {loading ? 'Recording...' : 'Record Contribution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SavingsPage() {
  const { hasRole } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showRecord, setShowRecord] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15, search };
      const { data } = await api.get('/accounts', { params });
      setAccounts(data.data);
      setPagination(data.pagination || {});
    } catch { setAccounts([]); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { setPage(1); }, [search]);

  const totalSavings = accounts.reduce((s, a) => s + parseFloat(a.savings_balance || 0), 0);
  const totalShares  = accounts.reduce((s, a) => s + parseFloat(a.shares_balance || 0), 0);
  const totalWelfare = accounts.reduce((s, a) => s + parseFloat(a.welfare_balance || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-semibold text-xl text-gray-900">Savings & Shares</h1>
          <p className="text-sm text-gray-400 mt-0.5">Member account balances and contributions</p>
        </div>
        {hasRole('admin', 'treasurer') && (
          <button onClick={() => setShowRecord(true)} className="flex items-center gap-2 h-9 px-4 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            Record Contribution
          </button>
        )}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Savings', value: totalSavings, color: 'bg-primary-600' },
          { label: 'Total Shares', value: totalShares, color: 'bg-accent-500' },
          { label: 'Welfare Fund', value: totalWelfare, color: 'bg-emerald-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${s.color}`} />
            <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
            <div className="font-display font-semibold text-xl text-gray-900">{formatCurrency(s.value)}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members..."
          className="w-full h-9 pl-9 pr-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-5 py-3 font-medium">Member</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Savings</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Shares</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden md:table-cell">Welfare</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden lg:table-cell">Total</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden md:table-cell">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array(8).fill(0).map((_, i) => (
                <tr key={i} className="border-t border-gray-50 animate-pulse">
                  {Array(6).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-20"/></td>)}
                </tr>
              )) : accounts.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No accounts found</td></tr>
              ) : accounts.map(a => {
                const total = parseFloat(a.savings_balance || 0) + parseFloat(a.shares_balance || 0) + parseFloat(a.welfare_balance || 0);
                return (
                  <tr key={a.user_id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-[11px] font-semibold text-white">{getInitials(a.full_name)}</div>
                        <div>
                          <div className="text-[13px] font-medium text-gray-900">{a.full_name}</div>
                          <div className="text-[11px] text-gray-400">{a.member_no}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium text-gray-900">{formatCurrency(a.savings_balance)}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-700">{formatCurrency(a.shares_balance)}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-[13px] text-gray-700">{formatCurrency(a.welfare_balance)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="text-[13px] font-semibold text-primary-600">{formatCurrency(total)}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-[12px] text-gray-400">{formatDate(a.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-400">Page {pagination.page} of {pagination.pages}</div>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-7 px-3 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-white">← Prev</button>
              <button disabled={page === pagination.pages} onClick={() => setPage(p => p + 1)} className="h-7 px-3 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-white">Next →</button>
            </div>
          </div>
        )}
      </div>
      {showRecord && <RecordContributionModal onClose={() => setShowRecord(false)} onSuccess={fetchAccounts} />}
    </div>
  );
}
