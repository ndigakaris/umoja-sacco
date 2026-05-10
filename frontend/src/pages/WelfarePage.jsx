import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

const StatusBadge = ({ status }) => {
  const map = {
    pending: 'bg-amber-100 text-amber-700', approved: 'bg-blue-100 text-blue-700',
    rejected: 'bg-red-100 text-red-700', disbursed: 'bg-green-100 text-green-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
};

export default function WelfarePage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin', 'treasurer');
  const [cases, setCases] = useState([]);
  const [summary, setSummary] = useState({});
  const [members, setMembers] = useState([]);
  const [poolBalance, setPoolBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [showFileModal, setShowFileModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fileForm, setFileForm] = useState({ category: 'bereavement', amount: '', description: '', user_id: '' });
  const [reviewForm, setReviewForm] = useState({ status: 'approved', review_note: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [wRes, memRes] = await Promise.all([
        api.get('/welfare', { params: { status: activeTab === 'all' ? undefined : activeTab } }),
        isAdmin ? api.get('/members', { params: { limit: 200 } }) : Promise.resolve({ data: { data: [] } }),
      ]);
      setCases(wRes.data.data || []);
      setSummary(wRes.data.summary || {});
      setMembers(memRes.data.data || []);
      if (isAdmin) {
        try {
          const pool = await api.get('/welfare/pool-balance');
          setPoolBalance(pool.data.data?.pool_balance);
        } catch {}
      }
    } catch {}
    setLoading(false);
  }, [activeTab, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFile = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/welfare', {
        ...fileForm,
        user_id: isAdmin && fileForm.user_id ? fileForm.user_id : user.id,
      });
      setSuccess('Welfare case filed successfully');
      setShowFileModal(false);
      setFileForm({ category: 'bereavement', amount: '', description: '', user_id: '' });
      fetchData();
    } catch (err) { setError(err.response?.data?.message || 'Failed to file case'); }
    setSaving(false);
  };

  const openReview = (wc, forceStatus) => {
    setSelectedCase(wc);
    setReviewForm({ status: forceStatus || 'approved', review_note: '' });
    setShowReviewModal(true);
    setError('');
  };

  const handleReview = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const { data } = await api.patch(`/welfare/${selectedCase.id}/review`, reviewForm);
      let msg = `Case ${reviewForm.status}`;
      if (data.data?.savings_fallback) msg += ' (⚠️ Welfare pool insufficient — funded from member savings)';
      setSuccess(msg);
      setShowReviewModal(false);
      fetchData();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-gray-900">Welfare</h1>
          <p className="text-sm text-gray-500">Member welfare case management</p>
        </div>
        <button onClick={() => { setShowFileModal(true); setError(''); }}
          className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
          + File Case
        </button>
      </div>

      {(error || success) && (
        <div className={`rounded-lg p-3 text-sm border ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {error || `✅ ${success}`}
          <button onClick={() => { setError(''); setSuccess(''); }} className="ml-2 underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Cases', value: summary.total_cases || 0, fmt: 'num', color: 'text-gray-900' },
          { label: 'Pending', value: summary.pending_count || 0, fmt: 'num', color: 'text-amber-600' },
          { label: 'Disbursed', value: summary.disbursed_amount, fmt: 'cur', color: 'text-green-600' },
          { label: 'Total Claimed', value: summary.total_amount, fmt: 'cur', color: 'text-primary-700' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>
              {c.fmt === 'cur' ? formatCurrency(c.value) : c.value}
            </p>
          </div>
        ))}
      </div>

      {isAdmin && poolBalance !== null && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${parseFloat(poolBalance) < 10000 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
          <span className="text-lg">{parseFloat(poolBalance) < 10000 ? '⚠️' : '💰'}</span>
          <span>
            <strong>Welfare Pool Balance:</strong> {formatCurrency(poolBalance)}
            {parseFloat(poolBalance) < 10000 && ' — Pool is low. Disbursements will fall back to member savings.'}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {['pending', 'approved', 'disbursed', 'rejected', 'all'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab ? 'border-b-2 border-primary-600 text-primary-700' : 'text-gray-500 hover:text-gray-700'
            }`}>{tab}</button>
        ))}
      </div>

      {/* Case list */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">Loading…</div>
        ) : cases.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">No {activeTab} welfare cases</div>
        ) : cases.map(wc => (
          <div key={wc.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{wc.full_name}</span>
                  <span className="text-xs text-gray-400">{wc.member_no}</span>
                  <code className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{wc.reference}</code>
                  <StatusBadge status={wc.status} />
                </div>
                <p className="text-sm text-gray-600 capitalize">
                  {wc.category?.replace(/_/g, ' ')} — <span className="font-semibold text-gray-900">{formatCurrency(wc.amount)}</span>
                </p>
                {wc.description && <p className="text-sm text-gray-500 mt-1">{wc.description}</p>}
                {wc.review_note && <p className="text-xs text-gray-500 mt-1 italic">Note: {wc.review_note}</p>}
                <p className="text-xs text-gray-400 mt-1.5">
                  Filed {formatDate(wc.filed_date)}
                  {wc.reviewed_by_name && ` · Reviewed by ${wc.reviewed_by_name}`}
                  {wc.disbursed_at && ` · Disbursed ${formatDate(wc.disbursed_at)}`}
                </p>
              </div>
              {isAdmin && (
                <div className="flex flex-col gap-1.5 shrink-0">
                  {wc.status === 'pending' && (
                    <>
                      <button onClick={() => openReview(wc, 'approved')}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700">
                        ✓ Approve
                      </button>
                      <button onClick={() => openReview(wc, 'rejected')}
                        className="px-3 py-1.5 bg-red-100 text-red-700 text-xs rounded-lg hover:bg-red-200">
                        ✗ Reject
                      </button>
                    </>
                  )}
                  {wc.status === 'approved' && (
                    <button onClick={() => openReview(wc, 'disbursed')}
                      className="px-3 py-1.5 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700">
                      💸 Disburse
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* File Case Modal */}
      {showFileModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">File Welfare Case</h2>
              <button onClick={() => setShowFileModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleFile} className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
              {isAdmin && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Member</label>
                  <select value={fileForm.user_id} onChange={e => setFileForm(f => ({ ...f, user_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="">Filing for self</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name} — {m.member_no}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category *</label>
                <select required value={fileForm.category} onChange={e => setFileForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  {['bereavement', 'illness', 'emergency', 'disability', 'education'].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KES) *</label>
                <input required type="number" min="1" value={fileForm.amount}
                  onChange={e => setFileForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={fileForm.description} onChange={e => setFileForm(f => ({ ...f, description: e.target.value }))}
                  rows={3} placeholder="Briefly describe the welfare need…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowFileModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                  {saving ? 'Filing…' : 'File Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review / Disburse Modal */}
      {showReviewModal && selectedCase && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">
                {reviewForm.status === 'disbursed' ? '💸 Disburse' : reviewForm.status === 'rejected' ? '✗ Reject' : '✓ Approve'} — {selectedCase.reference}
              </h2>
              <button onClick={() => setShowReviewModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleReview} className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-gray-500">Member:</span> <strong>{selectedCase.full_name}</strong></p>
                <p><span className="text-gray-500">Category:</span> <span className="capitalize">{selectedCase.category}</span></p>
                <p><span className="text-gray-500">Amount:</span> <strong className="text-primary-700">{formatCurrency(selectedCase.amount)}</strong></p>
                {selectedCase.description && <p className="text-gray-500 text-xs">{selectedCase.description}</p>}
              </div>

              {reviewForm.status === 'disbursed' && poolBalance !== null && parseFloat(poolBalance) < parseFloat(selectedCase.amount) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  ⚠️ <strong>Pool insufficient.</strong> KES {formatCurrency(poolBalance)} available.
                  If confirmed, the shortfall will be deducted from the member's savings account.
                </div>
              )}

              {reviewForm.status !== 'disbursed' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Decision</label>
                  <select value={reviewForm.status} onChange={e => setReviewForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Review Note</label>
                <textarea value={reviewForm.review_note} onChange={e => setReviewForm(f => ({ ...f, review_note: e.target.value }))}
                  rows={2} placeholder="Optional note to member…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowReviewModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className={`flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${
                    reviewForm.status === 'rejected' ? 'bg-red-600 hover:bg-red-700' :
                    reviewForm.status === 'disbursed' ? 'bg-primary-600 hover:bg-primary-700' : 'bg-green-600 hover:bg-green-700'
                  }`}>
                  {saving ? 'Processing…' : reviewForm.status === 'disbursed' ? '💸 Confirm Disbursement' : reviewForm.status === 'rejected' ? 'Reject Case' : 'Approve Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
