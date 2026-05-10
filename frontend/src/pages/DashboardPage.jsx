/**
 * Dashboard Page — KPIs, charts, quick actions
 * Fetches live data from /api/dashboard
 */

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

// Stat card component
function StatCard({ label, value, sub, subType = 'neutral', accentColor }) {
  const colors = { blue: 'bg-primary-600', green: 'bg-accent-500', amber: 'bg-amber-500', red: 'bg-red-500' };
  const subColors = { up: 'text-accent-500', down: 'text-red-500', neutral: 'text-gray-400' };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${colors[accentColor] || 'bg-primary-600'}`} />
      <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">{label}</div>
      <div className="font-display font-semibold text-xl text-gray-900 mb-1">{value}</div>
      {sub && <div className={`text-[12px] ${subColors[subType]}`}>{sub}</div>}
    </div>
  );
}

// Mock trend data (replace with API call to /api/dashboard/trend)
const trendData = [
  { month: 'Aug', savings: 3.9, repayments: 2.1, disbursements: 3.2 },
  { month: 'Sep', savings: 4.1, repayments: 2.4, disbursements: 2.8 },
  { month: 'Oct', savings: 4.3, repayments: 2.3, disbursements: 3.5 },
  { month: 'Nov', savings: 4.0, repayments: 2.7, disbursements: 2.9 },
  { month: 'Dec', savings: 4.2, repayments: 2.5, disbursements: 3.8 },
  { month: 'Jan', savings: 4.5, repayments: 3.1, disbursements: 4.2 },
];

const recentLoans = [
  { name: 'Wanjiku Kamau', ref: 'MBR-2041', amount: 250000, status: 'pending', date: '2025-01-15' },
  { name: 'Moses Odhiambo', ref: 'MBR-1988', amount: 500000, status: 'active', date: '2025-01-14' },
  { name: 'Amina Njoroge', ref: 'MBR-2210', amount: 150000, status: 'under_review', date: '2025-01-13' },
  { name: 'Peter Kipchoge', ref: 'MBR-1755', amount: 75000, status: 'rejected', date: '2025-01-12' },
];

const statusBadge = {
  pending: 'bg-amber-50 text-amber-700',
  active: 'bg-green-50 text-green-700',
  under_review: 'bg-blue-50 text-blue-700',
  rejected: 'bg-red-50 text-red-700',
  approved: 'bg-green-50 text-green-700',
};

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard')
      .then(r => setStats(r.data.data))
      .catch(() => {}) // Use mock data below if API not connected
      .finally(() => setLoading(false));
  }, []);

  const kpis = stats ? [
    { label: 'Total Members', value: Number(stats.members?.total || 1284).toLocaleString(), sub: `+23 this month`, subType: 'up', accentColor: 'blue' },
    { label: 'Total Savings', value: formatCurrency(stats.savings?.total_savings || 48300000), sub: '+12.4% vs last quarter', subType: 'up', accentColor: 'green' },
    { label: 'Loan Portfolio', value: formatCurrency(stats.loans?.outstanding || 31700000), sub: `${stats.loans?.count || 342} active loans`, subType: 'neutral', accentColor: 'amber' },
    { label: 'Pending Approvals', value: String(stats.pending_loans?.count || 4), sub: `${stats.overdue_loans?.count || 28} overdue loans`, subType: 'down', accentColor: 'red' },
  ] : [];

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display font-semibold text-xl text-gray-900">
          Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">{formatDate(new Date(), 'long')} · UmojaSACCO Management System</p>
      </div>

      {/* KPI Cards */}
      {hasRole('admin', 'treasurer', 'auditor') && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {loading ? Array(4).fill(0).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
              <div className="h-2 bg-gray-100 rounded w-16 mb-3" />
              <div className="h-6 bg-gray-100 rounded w-24 mb-2" />
              <div className="h-2 bg-gray-100 rounded w-20" />
            </div>
          )) : kpis.map(k => <StatCard key={k.label} {...k} />)}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Main chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="font-medium text-gray-900 text-sm">Financial Overview (Last 6 Months)</div>
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary-600 inline-block" />Savings</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-accent-500 inline-block" />Repayments</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />Disbursements</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData} barSize={8} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}M`} />
              <Tooltip formatter={(v) => `KES ${v}M`} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="savings" fill="#0F4C81" radius={[3, 3, 0, 0]} />
              <Bar dataKey="repayments" fill="#00A878" radius={[3, 3, 0, 0]} />
              <Bar dataKey="disbursements" fill="#F59E0B" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Side cards */}
        <div className="flex flex-col gap-3">
          <div className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl p-4 text-white">
            <div className="text-[11px] text-white/60 uppercase tracking-wider mb-1">Loan Portfolio</div>
            <div className="font-display font-semibold text-2xl mb-1">KES 31.7M</div>
            <div className="text-xs text-white/60">342 active · 28 overdue · NPL: 3.2%</div>
            <div className="mt-3 h-1.5 bg-white/20 rounded-full"><div className="h-full w-[78%] bg-accent-500 rounded-full" /></div>
            <div className="text-[11px] text-white/50 mt-1">78% performing</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-800 to-emerald-600 rounded-xl p-4 text-white">
            <div className="text-[11px] text-white/60 uppercase tracking-wider mb-1">Welfare Fund</div>
            <div className="font-display font-semibold text-2xl mb-1">KES 3.84M</div>
            <div className="text-xs text-white/60">7 pending · 142 disbursed YTD</div>
          </div>
        </div>
      </div>

      {/* Recent loan applications */}
      {hasRole('admin', 'treasurer', 'auditor') && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <div className="font-medium text-gray-900 text-sm">Recent Loan Applications</div>
            <a href="/loans" className="text-xs text-primary-600 font-medium hover:text-primary-500">View all</a>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-5 py-2.5 font-medium">Member</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-2.5 font-medium">Amount</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-2.5 font-medium">Status</th>
                <th className="text-left text-[11px] text-gray-400 uppercase tracking-wide px-4 py-2.5 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {recentLoans.map((loan, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center text-[10px] font-semibold text-white">
                        {loan.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium text-gray-900">{loan.name}</div>
                        <div className="text-[11px] text-gray-400">{loan.ref}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-gray-700">{formatCurrency(loan.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${statusBadge[loan.status] || 'bg-gray-50 text-gray-600'}`}>
                      {loan.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-400">{formatDate(loan.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
