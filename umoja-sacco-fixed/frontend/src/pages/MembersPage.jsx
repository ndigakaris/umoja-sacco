/**
 * Members Page — List, search, add, manage members
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { formatCurrency, formatDate, getInitials } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

const statusBadge = {
  active:    'bg-green-50 text-green-700 border border-green-200',
  pending:   'bg-amber-50 text-amber-700 border border-amber-200',
  suspended: 'bg-red-50 text-red-700 border border-red-200',
  inactive:  'bg-gray-50 text-gray-500 border border-gray-200',
};

const kycBadge = {
  verified:   'bg-green-50 text-green-700',
  pending:    'bg-amber-50 text-amber-700',
  unverified: 'bg-gray-50 text-gray-500',
};

function AddMemberModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', id_number: '', role: 'member', nok_name: '', nok_relationship: '', nok_phone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/members', form);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-gray-900">Add New Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Full Name *</label>
              <input name="full_name" required value={form.full_name} onChange={handleChange} placeholder="e.g. Jane Wanjiku Kamau"
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
              <input name="email" type="email" required value={form.email} onChange={handleChange} placeholder="email@example.com"
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Phone *</label>
              <input name="phone" required value={form.phone} onChange={handleChange} placeholder="0712 345 678"
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">ID Number *</label>
              <input name="id_number" required value={form.id_number} onChange={handleChange} placeholder="National ID"
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
              <select name="role" value={form.role} onChange={handleChange}
                className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 bg-white">
                <option value="member">Member</option>
                <option value="treasurer">Treasurer</option>
                <option value="auditor">Auditor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-3">Next of Kin</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input name="nok_name" value={form.nok_name} onChange={handleChange} placeholder="Next of kin name"
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Relationship</label>
                <input name="nok_relationship" value={form.nok_relationship} onChange={handleChange} placeholder="e.g. Spouse"
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Phone</label>
                <input name="nok_phone" value={form.nok_phone} onChange={handleChange} placeholder="Next of kin phone"
                  className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 h-10 bg-primary-600 hover:bg-primary-500 text-white text-sm rounded-lg disabled:opacity-60">
              {loading ? 'Creating...' : 'Create Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MembersPage() {
  const { hasRole } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [showAdd, setShowAdd] = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15, search, ...(statusFilter && { status: statusFilter }) };
      const { data } = await api.get('/members', { params });
      setMembers(data.data);
      setPagination(data.pagination);
    } catch { setMembers([]); }
    finally { setLoading(false); }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const handleStatusChange = async (id, status) => {
    try { await api.patch(`/members/${id}`, { status }); fetchMembers(); } catch {}
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-semibold text-xl text-gray-900">Members</h1>
          <p className="text-sm text-gray-400 mt-0.5">{pagination.total ? `${pagination.total} total members` : 'Manage SACCO membership'}</p>
        </div>
        {hasRole('admin') && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 h-9 px-4 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            Add Member
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, member no, ID..."
            className="w-full h-9 pl-9 pr-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 bg-white text-gray-600">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-5 py-3 font-medium">Member</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden md:table-cell">Contact</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden lg:table-cell">Savings</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden lg:table-cell">Loan Bal.</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Status</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden sm:table-cell">KYC</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array(8).fill(0).map((_, i) => (
                <tr key={i} className="border-t border-gray-50 animate-pulse">
                  <td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-gray-100 rounded-full"/><div><div className="h-3 bg-gray-100 rounded w-28 mb-1"/><div className="h-2 bg-gray-100 rounded w-16"/></div></div></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-3 bg-gray-100 rounded w-24"/></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3 bg-gray-100 rounded w-20"/></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3 bg-gray-100 rounded w-20"/></td>
                  <td className="px-4 py-3"><div className="h-5 bg-gray-100 rounded-full w-14"/></td>
                  <td className="px-4 py-3 hidden sm:table-cell"><div className="h-5 bg-gray-100 rounded-full w-14"/></td>
                  <td className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-10"/></td>
                </tr>
              )) : members.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">{search ? `No members found for "${search}"` : 'No members yet'}</td></tr>
              ) : members.map(m => (
                <tr key={m.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0">{getInitials(m.full_name)}</div>
                      <div>
                        <div className="text-[13px] font-medium text-gray-900">{m.full_name}</div>
                        <div className="text-[11px] text-gray-400">{m.member_no} · {m.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="text-[12px] text-gray-700">{m.phone || '—'}</div>
                    <div className="text-[11px] text-gray-400 truncate max-w-[160px]">{m.email}</div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="text-[13px] text-gray-700">{formatCurrency(m.savings_balance)}</div>
                    <div className="text-[11px] text-gray-400">Shares: {formatCurrency(m.shares_balance)}</div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className={`text-[13px] font-medium ${parseFloat(m.loan_balance) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {parseFloat(m.loan_balance) > 0 ? formatCurrency(m.loan_balance) : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${statusBadge[m.status] || 'bg-gray-50 text-gray-500'}`}>{m.status}</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${kycBadge[m.kyc_status] || 'bg-gray-50 text-gray-500'}`}>{m.kyc_status || 'unverified'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link to={`/members/${m.id}`} className="text-xs text-primary-600 hover:text-primary-500 font-medium">View</Link>
                      {hasRole('admin') && m.status === 'active' && <button onClick={() => handleStatusChange(m.id, 'suspended')} className="text-xs text-red-500 hover:text-red-400">Suspend</button>}
                      {hasRole('admin') && m.status === 'suspended' && <button onClick={() => handleStatusChange(m.id, 'active')} className="text-xs text-green-600 hover:text-green-500">Activate</button>}
                      {hasRole('admin') && m.status === 'pending' && <button onClick={() => handleStatusChange(m.id, 'active')} className="text-xs text-green-600 hover:text-green-500 font-medium">Approve</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-400">Page {pagination.page} of {pagination.pages} · {pagination.total} members</div>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-7 px-3 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-white">← Prev</button>
              <button disabled={page === pagination.pages} onClick={() => setPage(p => p + 1)} className="h-7 px-3 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-white">Next →</button>
            </div>
          </div>
        )}
      </div>
      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onSuccess={fetchMembers} />}
    </div>
  );
}
