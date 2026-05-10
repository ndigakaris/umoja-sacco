import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';

const StatusBadge = ({ status }) => {
  const map = { pending: 'bg-amber-100 text-amber-700', paid: 'bg-green-100 text-green-700', waived: 'bg-gray-100 text-gray-500' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
};

const AutoBadge = ({ isAuto }) => (
  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isAuto ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
    {isAuto ? 'Auto' : 'Manual'}
  </span>
);

export default function PenaltiesPage() {
  const [penalties, setPenalties] = useState([]);
  const [summary, setSummary] = useState({});
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [showManualModal, setShowManualModal] = useState(false);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [manualForm, setManualForm] = useState({ user_id: '', type: 'missed_contribution', amount: '', description: '', period_date: '' });
  const [autoForm, setAutoForm] = useState({ period_date: new Date().toISOString().slice(0,7) + '-01', contribution_type: 'savings', deadline_day: 5 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchPenalties = useCallback(async () => {
    setLoading(true);
    try {
      const [penRes, memRes] = await Promise.all([
        api.get('/penalties', { params: { status: activeTab === 'all' ? undefined : activeTab } }),
        api.get('/members', { params: { limit: 200 } }),
      ]);
      setPenalties(penRes.data.data || []);
      setSummary(penRes.data.summary || {});
      setMembers(memRes.data.data || []);
    } catch {}
    setLoading(false);
  }, [activeTab]);

  useEffect(() => { fetchPenalties(); }, [fetchPenalties]);

  const handleWaive = async (id) => {
    const reason = prompt('Enter waive reason:');
    if (!reason) return;
    try {
      await api.patch(`/penalties/${id}/waive`, { waive_reason: reason });
      setSuccess('Penalty waived'); fetchPenalties();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); }
  };

  const handlePay = async (id) => {
    if (!window.confirm('Mark this penalty as paid?')) return;
    try {
      await api.patch(`/penalties/${id}/pay`);
      setSuccess('Penalty marked as paid'); fetchPenalties();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); }
  };

  const handleManualCreate = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/penalties', manualForm);
      setSuccess('Manual penalty created');
      setShowManualModal(false);
      setManualForm({ user_id: '', type: 'missed_contribution', amount: '', description: '', period_date: '' });
      fetchPenalties();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const handleAutoGenerate = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const { data } = await api.post('/penalties/auto-generate', autoForm);
      setSuccess(`Auto-generated ${data.data?.length || 0} penalties`);
      setShowAutoModal(false);
      fetchPenalties();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold text-gray-900">Penalties</h1>
          <p className="text-sm text-gray-500">Penalty tracking and management</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowAutoModal(true); setError(''); }}
            className="px-3 py-2 border border-blue-300 text-blue-700 text-sm rounded-lg hover:bg-blue-50 flex items-center gap-1.5">
            ⚡ Auto-Generate
          </button>
          <button onClick={() => { setShowManualModal(true); setError(''); }}
            className="px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
            + Manual Penalty
          </button>
        </div>
      </div>

      {(error || success) && (
        <div className={`rounded-lg p-3 text-sm ${error ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {error || `✅ ${success}`}
          <button onClick={() => { setError(''); setSuccess(''); }} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Penalties</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{summary.count || 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Amount</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(summary.total_amount)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Pending Amount</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(summary.pending_amount)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {['pending','paid','waived','all'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab ? 'border-b-2 border-primary-600 text-primary-700' : 'text-gray-500 hover:text-gray-700'
            }`}>{tab}</button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading…</div>
        ) : penalties.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No {activeTab} penalties</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {penalties.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.full_name}</div>
                    <div className="text-xs text-gray-400">{p.member_no}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{p.type?.replace(/_/g,' ')}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-red-600">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.period_date ? formatDate(p.period_date) : '—'}</td>
                  <td className="px-4 py-3"><AutoBadge isAuto={p.is_auto} /></td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(p.created_at)}</td>
                  <td className="px-4 py-3">
                    {p.status === 'pending' && (
                      <div className="flex gap-1">
                        <button onClick={() => handlePay(p.id)}
                          className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200">Pay</button>
                        <button onClick={() => handleWaive(p.id)}
                          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Waive</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual Penalty Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">Manual Penalty</h2>
              <button onClick={() => setShowManualModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <form onSubmit={handleManualCreate} className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Member *</label>
                <select required value={manualForm.user_id} onChange={e => setManualForm(f => ({...f, user_id: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  <option value="">Select member…</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.full_name} — {m.member_no}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Penalty Type *</label>
                <select required value={manualForm.type} onChange={e => setManualForm(f => ({...f, type: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  <option value="missed_contribution">Missed Contribution</option>
                  <option value="late_repayment">Late Repayment</option>
                  <option value="rule_violation">Rule Violation</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KES) *</label>
                <input required type="number" min="1" value={manualForm.amount} onChange={e => setManualForm(f => ({...f, amount: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Period Date</label>
                <input type="date" value={manualForm.period_date} onChange={e => setManualForm(f => ({...f, period_date: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea value={manualForm.description} onChange={e => setManualForm(f => ({...f, description: e.target.value}))} rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowManualModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                  {saving ? 'Creating…' : 'Create Penalty'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auto-Generate Modal */}
      {showAutoModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">⚡ Auto-Generate Penalties</h2>
              <button onClick={() => setShowAutoModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <form onSubmit={handleAutoGenerate} className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                This will automatically issue penalties to all active members who have not made their contribution for the selected period, after the deadline day.
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Period (Month Start Date)</label>
                <input type="date" value={autoForm.period_date} onChange={e => setAutoForm(f => ({...f, period_date: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contribution Type</label>
                <select value={autoForm.contribution_type} onChange={e => setAutoForm(f => ({...f, contribution_type: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  <option value="savings">Savings</option>
                  <option value="shares">Shares</option>
                  <option value="welfare">Welfare</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deadline Day of Month</label>
                <input type="number" min="1" max="28" value={autoForm.deadline_day} onChange={e => setAutoForm(f => ({...f, deadline_day: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAutoModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Generating…' : '⚡ Generate Penalties'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
