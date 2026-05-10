/**
 * Audit Logs Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatDate } from '../utils/formatters';

const actionColors = {
  USER_LOGIN:      'bg-blue-50 text-blue-700',
  MEMBER_REGISTER: 'bg-green-50 text-green-700',
  LOAN_APPLY:      'bg-amber-50 text-amber-700',
  LOAN_APPROVE:    'bg-green-50 text-green-700',
  LOAN_REJECT:     'bg-red-50 text-red-700',
  LOAN_DISBURSE:   'bg-purple-50 text-purple-700',
  WELFARE_FILE:    'bg-teal-50 text-teal-700',
  WELFARE_APPROVE: 'bg-green-50 text-green-700',
  PENALTY_ISSUED:  'bg-red-50 text-red-700',
  DEPOSIT:         'bg-green-50 text-green-700',
  WITHDRAWAL:      'bg-orange-50 text-orange-700',
};

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 25, ...(search && { search }), ...(actionFilter && { action: actionFilter }) };
      const { data } = await api.get('/audit', { params });
      setLogs(data.data);
      setPagination(data.pagination || {});
    } catch { setLogs([]); }
    finally { setLoading(false); }
  }, [page, search, actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  useEffect(() => { setPage(1); }, [search, actionFilter]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display font-semibold text-xl text-gray-900">Audit Logs</h1>
        <p className="text-sm text-gray-400 mt-0.5">Immutable activity trail — all system actions recorded</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by user, action, description..."
            className="w-full h-9 pl-9 pr-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
        </div>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
          className="h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 bg-white text-gray-600">
          <option value="">All Actions</option>
          <option value="USER_LOGIN">Login</option>
          <option value="MEMBER_REGISTER">Registration</option>
          <option value="LOAN_APPLY">Loan Application</option>
          <option value="LOAN_APPROVE">Loan Approval</option>
          <option value="LOAN_DISBURSE">Loan Disbursement</option>
          <option value="DEPOSIT">Deposit</option>
          <option value="WITHDRAWAL">Withdrawal</option>
          <option value="WELFARE_FILE">Welfare Filed</option>
          <option value="PENALTY_ISSUED">Penalty Issued</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-5 py-3 font-medium">Action</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden md:table-cell">Actor</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Description</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden lg:table-cell">IP</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array(10).fill(0).map((_, i) => (
                <tr key={i} className="border-t border-gray-50 animate-pulse">
                  {Array(5).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-24"/></td>)}
                </tr>
              )) : logs.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">No audit logs found</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${actionColors[log.action] || 'bg-gray-50 text-gray-600'}`}>
                      {log.action?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="text-[12px] text-gray-700">{log.actor_name || '—'}</div>
                    <div className="text-[11px] text-gray-400 capitalize">{log.actor_role}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[12px] text-gray-600 max-w-xs truncate">{log.description}</div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-[11px] text-gray-400 font-mono">{log.ip_address || '—'}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-400 whitespace-nowrap">{formatDate(log.created_at, 'datetime')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-400">Page {pagination.page} of {pagination.pages} · {pagination.total} logs</div>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-7 px-3 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-white">← Prev</button>
              <button disabled={page === pagination.pages} onClick={() => setPage(p => p + 1)} className="h-7 px-3 text-xs border border-gray-200 rounded-md disabled:opacity-40 hover:bg-white">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
