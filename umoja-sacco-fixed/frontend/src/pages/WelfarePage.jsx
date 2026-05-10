/**
 * Welfare Page — Cases, approvals, fund tracking
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate, getInitials } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

const statusColors = {
  pending:   'bg-amber-50 text-amber-700 border border-amber-200',
  approved:  'bg-blue-50 text-blue-700 border border-blue-200',
  disbursed: 'bg-green-50 text-green-700 border border-green-200',
  rejected:  'bg-red-50 text-red-700 border border-red-200',
};

const categoryIcons = {
  bereavement: '🕊',
  illness:     '🏥',
  emergency:   '🚨',
  education:   '📚',
  other:       '📋',
};

function FileCaseModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ category: 'emergency', amount: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/welfare', form);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to file welfare case');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-gray-900">File Welfare Case</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category *</label>
            <select name="category" required value={form.category} onChange={handleChange}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 bg-white">
              <option value="emergency">Emergency</option>
              <option value="bereavement">Bereavement</option>
              <option value="illness">Illness</option>
              <option value="education">Education</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Amount Requested (KES) *</label>
            <input name="amount" type="number" required value={form.amount} onChange={handleChange} placeholder="e.g. 30000"
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description *</label>
            <textarea name="description" required value={form.description} onChange={handleChange} rows={4}
              placeholder="Describe your welfare need in detail..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 resize-none" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 h-10 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg disabled:opacity-60">
              {loading ? 'Filing...' : 'File Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WelfarePage() {
  const { hasRole } = useAuth();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showFile, setShowFile] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...(statusFilter && { status: statusFilter }) };
      const { data } = await api.get('/welfare', { params });
      setCases(data.data);
    } catch { setCases([]); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  const handleAction = async (id, action) => {
    setActionLoading(id + action);
    try {
      await api.patch(`/welfare/${id}/${action}`);
      fetchCases();
    } catch {}
    finally { setActionLoading(null); }
  };

  const pending = cases.filter(c => c.status === 'pending').length;
  const totalDisbursed = cases.filter(c => c.status === 'disbursed').reduce((s, c) => s + parseFloat(c.amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-semibold text-xl text-gray-900">Welfare</h1>
          <p className="text-sm text-gray-400 mt-0.5">Welfare cases and fund management</p>
        </div>
        <button onClick={() => setShowFile(true)} className="flex items-center gap-2 h-9 px-4 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          File Case
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500" />
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Pending Review</div>
          <div className="font-display font-semibold text-xl text-amber-600">{pending}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-500" />
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Total Cases</div>
          <div className="font-display font-semibold text-xl text-gray-900">{cases.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-600" />
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Total Disbursed</div>
          <div className="font-display font-semibold text-xl text-gray-900">{formatCurrency(totalDisbursed)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'pending', 'approved', 'disbursed', 'rejected'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`h-8 px-3 text-xs rounded-full border transition-colors ${statusFilter === s ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? Array(4).fill(0).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full"/>
              <div><div className="h-3 bg-gray-100 rounded w-32 mb-1"/><div className="h-2 bg-gray-100 rounded w-20"/></div>
            </div>
            <div className="h-2 bg-gray-100 rounded w-full mb-2"/>
            <div className="h-2 bg-gray-100 rounded w-2/3"/>
          </div>
        )) : cases.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400 text-sm">No welfare cases found</div>
        ) : cases.map(c => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-lg flex-shrink-0">
                  {categoryIcons[c.category] || '📋'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-[13px] font-medium text-gray-900">{c.full_name || 'Unknown Member'}</div>
                    <span className="text-[11px] text-gray-400">{c.member_no} · {c.reference}</span>
                  </div>
                  <div className="text-[12px] text-gray-500 capitalize mt-0.5">{c.category} case · Filed {formatDate(c.filed_date || c.created_at)}</div>
                  {c.description && <div className="text-[12px] text-gray-400 mt-1 truncate">{c.description}</div>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[c.status] || 'bg-gray-50 text-gray-500'}`}>{c.status}</span>
                <div className="text-[14px] font-semibold text-gray-900">{formatCurrency(c.amount)}</div>
              </div>
            </div>
            {hasRole('admin', 'treasurer') && c.status === 'pending' && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => handleAction(c.id, 'approve')} disabled={!!actionLoading}
                  className="h-8 px-4 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg border border-green-200 transition-colors disabled:opacity-50">
                  ✓ Approve
                </button>
                <button onClick={() => handleAction(c.id, 'reject')} disabled={!!actionLoading}
                  className="h-8 px-4 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg border border-red-200 transition-colors disabled:opacity-50">
                  ✕ Reject
                </button>
              </div>
            )}
            {hasRole('admin', 'treasurer') && c.status === 'approved' && (
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                <button onClick={() => handleAction(c.id, 'disburse')} disabled={!!actionLoading}
                  className="h-8 px-4 bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50">
                  Disburse Funds
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {showFile && <FileCaseModal onClose={() => setShowFile(false)} onSuccess={fetchCases} />}
    </div>
  );
}
