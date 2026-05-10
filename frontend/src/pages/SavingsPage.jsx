import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';

export default function SavingsPage() {
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState({});
  const [members, setMembers] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    user_id: '', savings: '', shares: '', welfare: '', penalty_payment: '', penalty_id: '',
    description: '', transaction_date: new Date().toISOString().split('T')[0],
  });
  const [memberPenalties, setMemberPenalties] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [savRes, memRes] = await Promise.all([
        api.get('/accounts', { params: { search } }),
        api.get('/members', { params: { limit: 200 } }),
      ]);
      setData(savRes.data.data || []);
      setTotals(savRes.data.totals || {});
      setMembers(memRes.data.data || []);
    } catch {}
    setLoading(false);
  }, [search]);

  useEffect(() => { const t = setTimeout(fetchData, 300); return () => clearTimeout(t); }, [fetchData]);

  // Load pending penalties for selected member
  useEffect(() => {
    if (!form.user_id) { setMemberPenalties([]); return; }
    api.get('/penalties', { params: { status: 'pending' } })
      .then(r => setMemberPenalties((r.data.data || []).filter(p => p.user_id === form.user_id)))
      .catch(() => {});
  }, [form.user_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/accounts/contribute', {
        user_id: form.user_id,
        savings: parseFloat(form.savings) || 0,
        shares: parseFloat(form.shares) || 0,
        welfare: parseFloat(form.welfare) || 0,
        penalty_payment: parseFloat(form.penalty_payment) || 0,
        penalty_id: form.penalty_id || undefined,
        description: form.description,
        transaction_date: form.transaction_date,
      });
      setSuccess('Contribution recorded successfully!');
      setShowModal(false);
      setForm({ user_id: '', savings: '', shares: '', welfare: '', penalty_payment: '', penalty_id: '', description: '', transaction_date: new Date().toISOString().split('T')[0] });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record contribution');
    }
    setSaving(false);
  };

  const total = (parseFloat(form.savings)||0) + (parseFloat(form.shares)||0) + (parseFloat(form.welfare)||0) + (parseFloat(form.penalty_payment)||0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-gray-900">Savings & Shares</h1>
          <p className="text-sm text-gray-500">Member contribution tracking</p>
        </div>
        <button onClick={() => { setShowModal(true); setError(''); }}
          className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
          + Record Contribution
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
          ✅ {success} <button onClick={() => setSuccess('')} className="ml-2 underline text-green-700">Dismiss</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Savings', value: totals.total_savings, color: 'text-primary-700' },
          { label: 'Total Shares', value: totals.total_shares, color: 'text-emerald-700' },
          { label: 'Total Welfare', value: totals.total_welfare, color: 'text-purple-700' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Search + Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search member…"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-primary-300" />
        </div>
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Savings</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Shares</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Welfare</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{m.full_name}</div>
                    <div className="text-xs text-gray-400">{m.member_no}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(m.savings_balance)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(m.shares_balance)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(m.welfare_balance)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatCurrency(m.total_contributions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Record Contribution Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">Record Contribution</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Member *</label>
                <select required value={form.user_id} onChange={e => setForm(f => ({...f, user_id: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  <option value="">Select member…</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name} — {m.member_no}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Transaction Date</label>
                <input type="date" value={form.transaction_date} onChange={e => setForm(f => ({...f, transaction_date: e.target.value}))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>

              {/* Contribution fields */}
              <div className="space-y-3 border border-gray-100 rounded-xl p-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contribution Amounts (KES)</p>
                {[
                  { key: 'savings', label: '💰 Savings', placeholder: 'e.g. 2000' },
                  { key: 'shares', label: '📊 Shares', placeholder: 'e.g. 500' },
                  { key: 'welfare', label: '❤️ Welfare', placeholder: 'e.g. 200' },
                ].map(f => (
                  <div key={f.key} className="flex items-center gap-3">
                    <label className="w-28 text-sm text-gray-600">{f.label}</label>
                    <input type="number" min="0" step="1" placeholder={f.placeholder}
                      value={form[f.key]} onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white" />
                  </div>
                ))}
              </div>

              {/* Penalty payment section */}
              {memberPenalties.length > 0 && (
                <div className="border border-amber-200 rounded-xl p-4 bg-amber-50 space-y-3">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">⚠️ Pay Pending Penalty</p>
                  <select value={form.penalty_id} onChange={e => {
                    const pen = memberPenalties.find(p => p.id === e.target.value);
                    setForm(f => ({ ...f, penalty_id: e.target.value, penalty_payment: pen ? pen.amount : '' }));
                  }} className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white">
                    <option value="">Select penalty to pay…</option>
                    {memberPenalties.map(p => (
                      <option key={p.id} value={p.id}>{p.reference} — {formatCurrency(p.amount)} ({p.type})</option>
                    ))}
                  </select>
                  {form.penalty_id && (
                    <div className="flex items-center gap-3">
                      <label className="w-28 text-sm text-amber-700">🏷️ Penalty</label>
                      <input type="number" min="0" value={form.penalty_payment}
                        onChange={e => setForm(f => ({...f, penalty_payment: e.target.value}))}
                        className="flex-1 border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white" />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))}
                  placeholder="e.g. May 2025 contributions"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>

              {total > 0 && (
                <div className="bg-primary-50 border border-primary-100 rounded-lg p-3 flex justify-between text-sm font-semibold text-primary-700">
                  <span>Total to Record</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving || total === 0}
                  className="flex-1 bg-primary-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                  {saving ? 'Recording…' : 'Record Contribution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
