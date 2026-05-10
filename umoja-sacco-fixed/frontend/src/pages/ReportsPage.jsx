/**
 * Reports Page — Downloadable reports
 */
import React, { useState } from 'react';
import api from '../utils/api';
import { formatDate } from '../utils/formatters';

function ReportCard({ title, description, icon, onDownload, loading }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-primary-200 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-xl">{icon}</div>
          <div>
            <div className="text-[14px] font-medium text-gray-900">{title}</div>
            <div className="text-[12px] text-gray-400 mt-0.5">{description}</div>
          </div>
        </div>
        <button onClick={onDownload} disabled={loading}
          className="flex items-center gap-1.5 h-8 px-3 bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium rounded-lg disabled:opacity-60 flex-shrink-0 transition-colors">
          {loading ? (
            <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"/>Generating...</>
          ) : (
            <><svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</>
          )}
        </button>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [loadingReport, setLoadingReport] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const download = async (type, format = 'csv') => {
    setLoadingReport(type);
    try {
      const params = { format, ...(dateFrom && { date_from: dateFrom }), ...(dateTo && { date_to: dateTo }) };
      const response = await api.get(`/reports/${type}`, { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `umoja-${type}-${new Date().toISOString().split('T')[0]}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Report generation failed. Please try again.');
    } finally {
      setLoadingReport(null);
    }
  };

  const reports = [
    { type: 'members',      title: 'Member Register',        description: 'Full list of all members with KYC status and account balances',   icon: '👥' },
    { type: 'savings',      title: 'Savings & Shares',       description: 'All member savings, shares, and welfare account balances',         icon: '💰' },
    { type: 'loans',        title: 'Loan Book',              description: 'Active loans, outstanding balances, and repayment status',         icon: '📋' },
    { type: 'transactions', title: 'Transaction History',    description: 'Complete transaction ledger for selected period',                  icon: '📊' },
    { type: 'penalties',    title: 'Penalties Report',       description: 'Penalty register with collection status',                          icon: '⚠️' },
    { type: 'welfare',      title: 'Welfare Cases Report',   description: 'Welfare case history and disbursements',                           icon: '♡' },
    { type: 'income',       title: 'Income & Expenditure',   description: 'SACCO income vs expenditure summary',                              icon: '📈' },
    { type: 'audit',        title: 'Audit Trail',            description: 'System activity log for compliance and auditing',                  icon: '🔍' },
  ];

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display font-semibold text-xl text-gray-900">Reports</h1>
        <p className="text-sm text-gray-400 mt-0.5">Generate and download SACCO reports</p>
      </div>

      {/* Date filter */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="text-xs font-medium text-gray-500 mb-3">Filter by Date Range (optional)</div>
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <label className="block text-xs text-gray-400 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600" />
          </div>
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="mt-4 h-9 px-3 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Clear</button>
          )}
          <div className="mt-4 text-xs text-gray-400">
            {dateFrom || dateTo ? `Filtering: ${dateFrom || 'start'} → ${dateTo || 'today'}` : 'No date filter — all records'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {reports.map(r => (
          <ReportCard key={r.type} {...r} loading={loadingReport === r.type} onDownload={() => download(r.type, 'csv')} />
        ))}
      </div>

      <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
        <div className="text-xs text-blue-700">
          <strong>SASRA Compliance:</strong> All reports are generated from live data and include timestamps for audit purposes. Reports are in CSV format compatible with Excel and accounting software.
        </div>
      </div>
    </div>
  );
}
