/**
 * Loans Page — Applications, approvals, repayment tracking
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate, loanStatusBadge } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

const statusColors = {
  draft:        'bg-gray-50 text-gray-500 border border-gray-200',
  pending:      'bg-amber-50 text-amber-700 border border-amber-200',
  under_review: 'bg-blue-50 text-blue-700 border border-blue-200',
  approved:     'bg-green-50 text-green-700 border border-green-200',
  active:       'bg-green-50 text-green-700 border border-green-200',
  rejected:     'bg-red-50 text-red-700 border border-red-200',
  completed:    'bg-gray-50 text-gray-500 border border-gray-200',
  defaulted:    'bg-red-50 text-red-700 border border-red-200',
};

function ApplyLoanModal({ onClose, onSuccess }) {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ product_id: '', amount: '', term_months: '', purpose: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/loans/products').then(r => setProducts(r.data.data || [])).catch(() => {});
  }, []);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/loans', form);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit application');
    } finally { setLoading(false); }
  };

  const selectedProduct = products.find(p => p.id === form.product_id);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-gray-900">Apply for a Loan</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Loan Product *</label>
            <select name="product_id" required value={form.product_id} onChange={handleChange}
              className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 bg-white">
              <option value="">Select a loan product</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} — {p.interest_rate}% p.a.</option>)}
            </select>
          </div>
          {selectedProduct && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 space-y-1">
              <div>Max: <b>{formatCurrency(selectedProduct.max_amount)}</b> · Min: {formatCurrency(selectedProduct.min_amount)}</div>
              <div>Term: {selectedProduct.min_term_months}–{selectedProduct.max_term_months} months · Rate: {selectedProduct.interest_rate}% ({selectedProduct.interest_method})</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Amount (KES) *</label>
              <input name="amount" type="number" required value={form.amount} onChange={handleChange}
                placeholder={selectedProduct ? `${selectedProduct.min_amount}–${selectedProduct.max_amount}` : 'e.g. 100000'}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Term (Months) *</label>
              <input name="term_months" type="number" required value={form.term_months} onChange={handleChange}
                placeholder={selectedProduct ? `${selectedProduct.min_term_months}–${selectedProduct.max_term_months}` : 'e.g. 12'}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Purpose *</label>
            <textarea name="purpose" required value={form.purpose} onChange={handleChange} rows={3}
              placeholder="Describe the purpose of this loan..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 resize-none" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 h-10 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg disabled:opacity-60">
              {loading ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoansPage() {
  const { user, hasRole } = useAuth();
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showApply, setShowApply] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [actionLoading, setActionLoading] = useState(null);

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15, ...(statusFilter && { status: statusFilter }) };
      const { data } = await api.get('/loans', { params });
      setLoans(data.data);
      setPagination(data.pagination || {});
    } catch { setLoans([]); }
    finally { setLoading(false); }
  }, [page, statusFilter]);

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  const handleAction = async (id, action) => {
    setActionLoading(id + action);
    try {
      await api.patch(`/loans/${id}/${action}`);
      fetchLoans();
    } catch {}
    finally { setActionLoading(null); }
  };

  const stats = {
    total: loans.length,
    active: loans.filter(l => l.status === 'active').length,
    pending: loans.filter(l => ['pending', 'under_review'].includes(l.status)).length,
    totalOutstanding: loans.reduce((s, l) => s + parseFloat(l.outstanding || 0), 0),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-semibold text-xl text-gray-900">Loans</h1>
          <p className="text-sm text-gray-400 mt-0.5">Loan applications and repayment tracking</p>
        </div>
        <button onClick={() => setShowApply(true)} className="flex items-center gap-2 h-9 px-4 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Apply for Loan
        </button>
      </div>

      {/* Stats */}
      {hasRole('admin', 'treasurer', 'auditor') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Loans', value: stats.total, color: 'bg-primary-600' },
            { label: 'Active', value: stats.active, color: 'bg-green-500' },
            { label: 'Pending Review', value: stats.pending, color: 'bg-amber-500' },
            { label: 'Outstanding', value: formatCurrency(stats.totalOutstanding), color: 'bg-red-500' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${s.color}`} />
              <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
              <div className="font-display font-semibold text-xl text-gray-900">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['', 'pending', 'under_review', 'active', 'approved', 'rejected', 'completed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`h-8 px-3 text-xs rounded-full border transition-colors ${statusFilter === s ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
            {s === '' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-5 py-3 font-medium">Ref / Member</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Product</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Principal</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden lg:table-cell">Outstanding</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden md:table-cell">Monthly</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Status</th>
                {hasRole('admin', 'treasurer') && <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? Array(6).fill(0).map((_, i) => (
                <tr key={i} className="border-t border-gray-50 animate-pulse">
                  {Array(hasRole('admin', 'treasurer') ? 7 : 6).fill(0).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-20"/></td>
                  ))}
                </tr>
              )) : loans.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">No loans found</td></tr>
              ) : loans.map(loan => (
                <tr key={loan.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="text-[13px] font-medium text-gray-900">{loan.reference}</div>
                    <div className="text-[11px] text-gray-400">{loan.full_name || loan.member_no}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[12px] text-gray-700">{loan.product_name}</div>
                    <div className="text-[11px] text-gray-400">{loan.interest_rate}% · {loan.term_months}mo</div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-gray-700">{formatCurrency(loan.principal)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className={`text-[13px] font-medium ${parseFloat(loan.outstanding) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {parseFloat(loan.outstanding) > 0 ? formatCurrency(loan.outstanding) : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-[12px] text-gray-600">{formatCurrency(loan.monthly_payment)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[loan.status] || 'bg-gray-50 text-gray-500'}`}>
                      {loan.status?.replace('_', ' ')}
                    </span>
                  </td>
                  {hasRole('admin', 'treasurer') && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {loan.status === 'pending' && (
                          <>
                            <button onClick={() => handleAction(loan.id, 'review')} disabled={!!actionLoading}
                              className="text-xs text-blue-600 hover:text-blue-500 font-medium">Review</button>
                          </>
                        )}
                        {loan.status === 'under_review' && (
                          <>
                            <button onClick={() => handleAction(loan.id, 'approve')} disabled={!!actionLoading}
                              className="text-xs text-green-600 hover:text-green-500 font-medium">Approve</button>
                            <button onClick={() => handleAction(loan.id, 'reject')} disabled={!!actionLoading}
                              className="text-xs text-red-500 hover:text-red-400">Reject</button>
                          </>
                        )}
                        {loan.status === 'approved' && (
                          <button onClick={() => handleAction(loan.id, 'disburse')} disabled={!!actionLoading}
                            className="text-xs text-primary-600 hover:text-primary-500 font-medium">Disburse</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
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
      {showApply && <ApplyLoanModal onClose={() => setShowApply(false)} onSuccess={fetchLoans} />}
    </div>
  );
}
