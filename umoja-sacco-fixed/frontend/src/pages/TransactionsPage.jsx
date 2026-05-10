/**
 * Transactions Page — Full transaction history with filters
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

const typeColors = {
  credit: 'text-green-600',
  debit:  'text-red-600',
};

const typeIcons = {
  deposit:      '↓',
  withdrawal:   '↑',
  loan_disbursement: '→',
  loan_repayment:    '←',
  penalty:      '⚠',
  welfare:      '♡',
  transfer:     '⇄',
};

export default function TransactionsPage() {
  const { hasRole } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...(typeFilter && { type: typeFilter }), ...(dateFrom && { date_from: dateFrom }), ...(dateTo && { date_to: dateTo }) };
      const { data } = await api.get('/transactions', { params });
      setTransactions(data.data);
      setPagination(data.pagination || {});
    } catch { setTransactions([]); }
    finally { setLoading(false); }
  }, [page, typeFilter, dateFrom, dateTo]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { setPage(1); }, [typeFilter, dateFrom, dateTo]);

  const totalCredit = transactions.filter(t => t.entry_type === 'credit').reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  const totalDebit  = transactions.filter(t => t.entry_type === 'debit').reduce((s, t) => s + parseFloat(t.amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-semibold text-xl text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-400 mt-0.5">Full transaction history</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Total Credits</div>
          <div className="font-display font-semibold text-lg text-green-600">{formatCurrency(totalCredit)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Total Debits</div>
          <div className="font-display font-semibold text-lg text-red-500">{formatCurrency(totalDebit)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Net</div>
          <div className={`font-display font-semibold text-lg ${totalCredit - totalDebit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatCurrency(totalCredit - totalDebit)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 bg-white text-gray-600">
          <option value="">All Types</option>
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="loan_disbursement">Loan Disbursement</option>
          <option value="loan_repayment">Loan Repayment</option>
          <option value="penalty">Penalty</option>
          <option value="welfare">Welfare</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
        {(typeFilter || dateFrom || dateTo) && (
          <button onClick={() => { setTypeFilter(''); setDateFrom(''); setDateTo(''); }}
            className="h-9 px-3 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Clear</button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-5 py-3 font-medium">Transaction</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden md:table-cell">Member</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden sm:table-cell">Account</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Amount</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium hidden lg:table-cell">Balance After</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array(8).fill(0).map((_, i) => (
                <tr key={i} className="border-t border-gray-50 animate-pulse">
                  {Array(6).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-24"/></td>)}
                </tr>
              )) : transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No transactions found</td></tr>
              ) : transactions.map(t => (
                <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${t.entry_type === 'credit' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                        {typeIcons[t.type] || (t.entry_type === 'credit' ? '↓' : '↑')}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-gray-900 capitalize">{t.type?.replace(/_/g, ' ')}</div>
                        <div className="text-[11px] text-gray-400 truncate max-w-[140px]">{t.description || t.reference}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="text-[12px] text-gray-700">{t.full_name || '—'}</div>
                    <div className="text-[11px] text-gray-400">{t.member_no}</div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-[11px] px-2 py-0.5 bg-gray-50 border border-gray-200 rounded-full capitalize text-gray-600">{t.account_type || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`text-[13px] font-semibold ${typeColors[t.entry_type]}`}>
                      {t.entry_type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-[12px] text-gray-600">{t.balance_after != null ? formatCurrency(t.balance_after) : '—'}</td>
                  <td className="px-4 py-3 text-[12px] text-gray-400">{formatDate(t.created_at, 'datetime')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-400">Page {pagination.page} of {pagination.pages} · {pagination.total} transactions</div>
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
