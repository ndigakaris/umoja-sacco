/**
 * Penalties Page
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate, getInitials } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

const statusColors = {
  pending: 'bg-amber-50 text-amber-700 border border-amber-200',
  paid:    'bg-green-50 text-green-700 border border-green-200',
  waived:  'bg-gray-50 text-gray-500 border border-gray-200',
};

const typeLabels = {
  late_repayment:      'Late Repayment',
  missed_contribution: 'Missed Contribution',
  rule_violation:      'Rule Violation',
};

export default function PenaltiesPage() {
  const { hasRole } = useAuth();
  const [penalties, setPenalties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchPenalties = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...(statusFilter && { status: statusFilter }) };
      const { data } = await api.get('/penalties', { params });
      setPenalties(data.data);
    } catch { setPenalties([]); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchPenalties(); }, [fetchPenalties]);

  const handleAction = async (id, action) => {
    setActionLoading(id + action);
    try {
      await api.patch(`/penalties/${id}/${action}`);
      fetchPenalties();
    } catch {}
    finally { setActionLoading(null); }
  };

  const pending = penalties.filter(p => p.status === 'pending');
  const totalPending = pending.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const totalCollected = penalties.filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-semibold text-xl text-gray-900">Penalties</h1>
          <p className="text-sm text-gray-400 mt-0.5">Penalty tracking and management</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500" />
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Pending</div>
          <div className="font-display font-semibold text-xl text-amber-600">{pending.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">{formatCurrency(totalPending)} outstanding</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-500" />
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Collected</div>
          <div className="font-display font-semibold text-xl text-green-600">{formatCurrency(totalCollected)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-600" />
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Total Cases</div>
          <div className="font-display font-semibold text-xl text-gray-900">{penalties.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['', 'pending', 'paid', 'waived'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`h-8 px-3 text-xs rounded-full border transition-colors ${statusFilter === s ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
            {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-5 py-3 font-medium">Member</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Type</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Amount</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden md:table-cell">Period</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Status</th>
                {hasRole('admin', 'treasurer') && <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? Array(6).fill(0).map((_, i) => (
                <tr key={i} className="border-t border-gray-50 animate-pulse">
                  {Array(hasRole('admin', 'treasurer') ? 6 : 5).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-20"/></td>)}
                </tr>
              )) : penalties.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No penalties found</td></tr>
              ) : penalties.map(p => (
                <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-[10px] font-semibold text-red-600">{getInitials(p.full_name || '')}</div>
                      <div>
                        <div className="text-[13px] font-medium text-gray-900">{p.full_name || '—'}</div>
                        <div className="text-[11px] text-gray-400">{p.member_no} · {p.reference}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[12px] text-gray-700">{typeLabels[p.type] || p.type}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-semibold text-red-600">{formatCurrency(p.amount)}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-[12px] text-gray-400">{p.period_date ? formatDate(p.period_date) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${statusColors[p.status] || 'bg-gray-50 text-gray-500'}`}>{p.status}</span>
                  </td>
                  {hasRole('admin', 'treasurer') && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {p.status === 'pending' && (
                          <>
                            <button onClick={() => handleAction(p.id, 'pay')} disabled={!!actionLoading}
                              className="text-xs text-green-600 hover:text-green-500 font-medium">Mark Paid</button>
                            <button onClick={() => handleAction(p.id, 'waive')} disabled={!!actionLoading}
                              className="text-xs text-gray-500 hover:text-gray-400">Waive</button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
