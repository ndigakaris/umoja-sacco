import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate, getInitials } from '../utils/formatters';

const Badge = ({ status }) => {
  const map = {
    active: 'bg-green-100 text-green-700', inactive: 'bg-gray-100 text-gray-600',
    suspended: 'bg-red-100 text-red-700', pending: 'bg-amber-100 text-amber-700',
    verified: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-600',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
};

const INITIAL_FORM = { full_name: '', email: '', phone: '', id_number: '', gender: '', role: 'member', nok_name: '', nok_relationship: '', nok_phone: '' };

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchMembers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/members', { params: { page, limit: 20, search, status: statusFilter } });
      setMembers(data.data);
      setPagination(data.pagination);
    } catch { /* ignore */ }
    setLoading(false);
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetchMembers(1), 300);
    return () => clearTimeout(t);
  }, [fetchMembers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/members', form);
      setSuccess(`Member created! Temp password: ${data.data.temp_password}`);
      setShowModal(false);
      setForm(INITIAL_FORM);
      fetchMembers(1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create member');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-semibold text-gray-900">Members</h1>
          <p className="text-sm text-gray-500">{pagination.total} total members</p>
        </div>
        <button onClick={() => { setShowModal(true); setError(''); setSuccess(''); }}
          className="btn-primary flex items-center gap-1.5 text-sm px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
          + Add Member
        </button>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
          ✅ {success}
          <button onClick={() => setSuccess('')} className="ml-2 text-green-600 underline">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, phone…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary-300"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading members…</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-400">No members found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Member</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Savings</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Shares</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Loan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">KYC</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-semibold text-primary-700 flex-shrink-0">
                        {getInitials(m.full_name)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{m.full_name}</div>
                        <div className="text-xs text-gray-400">{m.member_no}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div>{m.email}</div>
                    <div className="text-xs text-gray-400">{m.phone || '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(m.savings_balance)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(m.shares_balance)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(m.loan_balance)}</td>
                  <td className="px-4 py-3"><Badge status={m.status} /></td>
                  <td className="px-4 py-3"><Badge status={m.kyc_status || 'pending'} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Page {pagination.page} of {pagination.pages}</span>
          <div className="flex gap-2">
            <button disabled={pagination.page <= 1} onClick={() => fetchMembers(pagination.page - 1)}
              className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
            <button disabled={pagination.page >= pagination.pages} onClick={() => fetchMembers(pagination.page + 1)}
              className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {/* Create Member Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">Add New Member</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                  <input required value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                  <input required type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ID Number</label>
                  <input value={form.id_number} onChange={e => setForm(f => ({...f, id_number: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Gender</label>
                  <select value={form.gender} onChange={e => setForm(f => ({...f, gender: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="member">Member</option>
                    <option value="treasurer">Treasurer</option>
                    <option value="auditor">Auditor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Next of Kin</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">NOK Name</label>
                    <input value={form.nok_name} onChange={e => setForm(f => ({...f, nok_name: e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Relationship</label>
                    <input value={form.nok_relationship} onChange={e => setForm(f => ({...f, nok_relationship: e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">NOK Phone</label>
                    <input value={form.nok_phone} onChange={e => setForm(f => ({...f, nok_phone: e.target.value}))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                  {saving ? 'Creating…' : 'Create Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
