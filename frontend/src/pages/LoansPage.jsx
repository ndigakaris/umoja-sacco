import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate, loanStatusBadge } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

const StatusBadge = ({ status }) => {
  const { label, cls } = loanStatusBadge(status);
  const colors = {
    'badge-gray': 'bg-gray-100 text-gray-600',
    'badge-amber': 'bg-amber-100 text-amber-700',
    'badge-blue': 'bg-blue-100 text-blue-700',
    'badge-green': 'bg-green-100 text-green-700',
    'badge-red': 'bg-red-100 text-red-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[cls] || 'bg-gray-100 text-gray-600'}`}>{label}</span>;
};

export default function LoansPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole('admin', 'treasurer');
  const [loans, setLoans] = useState([]);
  const [products, setProducts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [applyForm, setApplyForm] = useState({ product_id: '', principal: '', term_months: '', purpose: '', user_id: '' });
  const [repayForm, setRepayForm] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0] });
  const [productForm, setProductForm] = useState({
    name: '', description: '', interest_rate: '', interest_method: 'reducing',
    min_amount: '', max_amount: '', min_term_months: '', max_term_months: '',
    max_multiplier: 4, guarantors_required: 2, processing_fee_pct: 1,
  });
  const [calcResult, setCalcResult] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 50 };
      if (activeTab !== 'all') params.status = activeTab;
      if (!isAdmin) params.user_id = user.id;

      const [lRes, pRes] = await Promise.all([
        api.get('/loans', { params }),
        api.get('/loans/products'),
      ]);
      setLoans(lRes.data.data || []);
      setProducts(pRes.data.data || []);
      if (isAdmin) {
        const mRes = await api.get('/members', { params: { limit: 200 } });
        setMembers(mRes.data.data || []);
      }
    } catch {}
    setLoading(false);
  }, [activeTab, isAdmin, user.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Live loan calculator
  useEffect(() => {
    const { product_id, principal, term_months } = applyForm;
    if (!product_id || !principal || !term_months) { setCalcResult(null); return; }
    const product = products.find(p => p.id === product_id);
    if (!product) return;
    const P = parseFloat(principal);
    const n = parseInt(term_months);
    const r = parseFloat(product.interest_rate) / 100 / 12;
    let monthly, totalPayable, totalInterest;
    if (product.interest_method === 'flat') {
      totalInterest = P * (parseFloat(product.interest_rate) / 100) * (n / 12);
      monthly = (P + totalInterest) / n;
      totalPayable = P + totalInterest;
    } else {
      monthly = r === 0 ? P / n : P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      totalPayable = monthly * n;
      totalInterest = totalPayable - P;
    }
    const processingFee = P * (parseFloat(product.processing_fee_pct) / 100);
    setCalcResult({ monthly: Math.round(monthly * 100) / 100, totalPayable: Math.round(totalPayable * 100) / 100, totalInterest: Math.round(totalInterest * 100) / 100, processingFee: Math.round(processingFee * 100) / 100 });
  }, [applyForm.product_id, applyForm.principal, applyForm.term_months, products]);

  const handleApply = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/loans', {
        ...applyForm,
        principal: parseFloat(applyForm.principal),
        term_months: parseInt(applyForm.term_months),
        user_id: isAdmin && applyForm.user_id ? applyForm.user_id : undefined,
      });
      setSuccess('Loan application submitted successfully');
      setShowApplyModal(false);
      setApplyForm({ product_id: '', principal: '', term_months: '', purpose: '', user_id: '' });
      setCalcResult(null);
      fetchData();
    } catch (err) { setError(err.response?.data?.message || 'Failed to submit'); }
    setSaving(false);
  };

  const handleApprove = async (loan, action) => {
    const comment = action === 'rejected' ? prompt('Enter rejection reason:') : '';
    if (action === 'rejected' && comment === null) return;
    try {
      await api.post(`/loans/${loan.id}/approve`, { action, comment });
      setSuccess(`Loan ${action}`);
      fetchData();
    } catch (err) { setError(err.response?.data?.message || 'Action failed'); }
  };

  const handleDisburse = async (loan) => {
    if (!window.confirm(`Disburse ${formatCurrency(loan.principal)} for ${loan.full_name}?`)) return;
    try {
      await api.post(`/loans/${loan.id}/disburse`);
      setSuccess('Loan disbursed successfully');
      fetchData();
    } catch (err) { setError(err.response?.data?.message || 'Disbursement failed'); }
  };

  const handleRepay = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post(`/loans/${selectedLoan.id}/repay`, {
        amount: parseFloat(repayForm.amount),
        payment_date: repayForm.payment_date,
      });
      setSuccess('Repayment recorded');
      setShowRepayModal(false);
      setRepayForm({ amount: '', payment_date: new Date().toISOString().split('T')[0] });
      fetchData();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const handleViewSchedule = async (loan) => {
    setSelectedLoan(loan);
    try {
      const { data } = await api.get(`/loans/${loan.id}/schedule`);
      setSchedule(data.data || []);
      setShowScheduleModal(true);
    } catch {}
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/loans/products', productForm);
      setSuccess('Loan product created');
      setShowProductModal(false);
      setProductForm({ name: '', description: '', interest_rate: '', interest_method: 'reducing', min_amount: '', max_amount: '', min_term_months: '', max_term_months: '', max_multiplier: 4, guarantors_required: 2, processing_fee_pct: 1 });
      fetchData();
    } catch (err) { setError(err.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const selectedProduct = products.find(p => p.id === applyForm.product_id);

  const tabs = isAdmin
    ? ['pending', 'under_review', 'approved', 'active', 'completed', 'rejected', 'all']
    : ['pending', 'under_review', 'approved', 'active', 'completed', 'all'];

  const totalPortfolio = loans.filter(l => l.status === 'active').reduce((s, l) => s + parseFloat(l.outstanding || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold text-gray-900">Loans</h1>
          <p className="text-sm text-gray-500">
            {loans.length} loans · Portfolio: {formatCurrency(totalPortfolio)}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => { setShowProductModal(true); setError(''); }}
              className="px-3 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
              ⚙ Loan Products
            </button>
          )}
          <button onClick={() => { setShowApplyModal(true); setError(''); setCalcResult(null); }}
            className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700">
            + Apply for Loan
          </button>
        </div>
      </div>

      {(error || success) && (
        <div className={`rounded-lg p-3 text-sm border ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-800'}`}>
          {error || `✅ ${success}`}
          <button onClick={() => { setError(''); setSuccess(''); }} className="ml-2 underline text-xs">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap capitalize transition-colors ${
              activeTab === tab ? 'border-b-2 border-primary-600 text-primary-700' : 'text-gray-500 hover:text-gray-700'
            }`}>{tab.replace(/_/g, ' ')}</button>
        ))}
      </div>

      {/* Loans list */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">Loading…</div>
        ) : loans.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-sm text-gray-400">No {activeTab.replace(/_/g,' ')} loans</div>
        ) : loans.map(loan => (
          <div key={loan.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">{loan.full_name || 'You'}</span>
                  <span className="text-xs text-gray-400">{loan.member_no}</span>
                  <code className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{loan.reference}</code>
                  <StatusBadge status={loan.status} />
                  {loan.product_name && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{loan.product_name}</span>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm">
                  <div><span className="text-gray-500 text-xs">Principal</span><p className="font-semibold">{formatCurrency(loan.principal)}</p></div>
                  <div><span className="text-gray-500 text-xs">Outstanding</span><p className="font-semibold text-red-600">{formatCurrency(loan.outstanding)}</p></div>
                  <div><span className="text-gray-500 text-xs">Monthly</span><p className="font-medium">{formatCurrency(loan.monthly_payment)}</p></div>
                  <div><span className="text-gray-500 text-xs">Term</span><p className="font-medium">{loan.term_months} months</p></div>
                </div>
                {loan.purpose && <p className="text-xs text-gray-500 mt-1.5 truncate">{loan.purpose}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  Applied {formatDate(loan.application_date)}
                  {loan.due_date && ` · Due ${formatDate(loan.due_date)}`}
                </p>
              </div>

              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={() => handleViewSchedule(loan)}
                  className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                  Schedule
                </button>
                {isAdmin && loan.status === 'pending' && (
                  <>
                    <button onClick={() => handleApprove(loan, 'approved')}
                      className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">✓ Approve</button>
                    <button onClick={() => handleApprove(loan, 'rejected')}
                      className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200">✗ Reject</button>
                  </>
                )}
                {isAdmin && loan.status === 'under_review' && (
                  <button onClick={() => handleApprove(loan, 'approved')}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Final Approve</button>
                )}
                {isAdmin && loan.status === 'approved' && (
                  <button onClick={() => handleDisburse(loan)}
                    className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700">💸 Disburse</button>
                )}
                {isAdmin && loan.status === 'active' && (
                  <button onClick={() => { setSelectedLoan(loan); setShowRepayModal(true); setError(''); }}
                    className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Record Repayment</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Apply Loan Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">Apply for a Loan</h2>
              <button onClick={() => setShowApplyModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleApply} className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

              {isAdmin && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Member (leave blank for self)</label>
                  <select value={applyForm.user_id} onChange={e => setApplyForm(f => ({ ...f, user_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                    <option value="">Self</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.full_name} — {m.member_no}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Loan Product *</label>
                <select required value={applyForm.product_id} onChange={e => setApplyForm(f => ({ ...f, product_id: e.target.value, principal: '', term_months: '' }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                  <option value="">Select a loan product…</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.interest_rate}% {p.interest_method} (up to {formatCurrency(p.max_amount)})
                    </option>
                  ))}
                </select>
                {selectedProduct && (
                  <p className="text-xs text-gray-500 mt-1">
                    KES {formatCurrency(selectedProduct.min_amount)} – {formatCurrency(selectedProduct.max_amount)} ·
                    {selectedProduct.min_term_months}–{selectedProduct.max_term_months} months ·
                    Up to {selectedProduct.max_multiplier}× savings
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KES) *</label>
                  <input required type="number" min="1" value={applyForm.principal}
                    onChange={e => setApplyForm(f => ({ ...f, principal: e.target.value }))}
                    placeholder={selectedProduct ? `${formatCurrency(selectedProduct.min_amount, false)} – ${formatCurrency(selectedProduct.max_amount, false)}` : 'e.g. 50000'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Term (Months) *</label>
                  <input required type="number" min="1" value={applyForm.term_months}
                    onChange={e => setApplyForm(f => ({ ...f, term_months: e.target.value }))}
                    placeholder={selectedProduct ? `${selectedProduct.min_term_months}–${selectedProduct.max_term_months}` : '12'}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Purpose</label>
                <textarea value={applyForm.purpose} onChange={e => setApplyForm(f => ({ ...f, purpose: e.target.value }))}
                  rows={2} placeholder="Describe the purpose of this loan…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>

              {/* Live calculator */}
              {calcResult && (
                <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">Monthly Payment</p><p className="text-lg font-bold text-primary-700">{formatCurrency(calcResult.monthly)}</p></div>
                  <div><p className="text-xs text-gray-500">Total Payable</p><p className="text-lg font-bold text-gray-900">{formatCurrency(calcResult.totalPayable)}</p></div>
                  <div><p className="text-xs text-gray-500">Total Interest</p><p className="font-medium text-orange-600">{formatCurrency(calcResult.totalInterest)}</p></div>
                  <div><p className="text-xs text-gray-500">Processing Fee</p><p className="font-medium text-gray-600">{formatCurrency(calcResult.processingFee)}</p></div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowApplyModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-primary-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                  {saving ? 'Submitting…' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repayment Modal */}
      {showRepayModal && selectedLoan && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">Record Repayment — {selectedLoan.reference}</h2>
              <button onClick={() => setShowRepayModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleRepay} className="p-5 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-sm">
                <p className="text-gray-500">Outstanding balance: <strong className="text-red-600">{formatCurrency(selectedLoan.outstanding)}</strong></p>
                <p className="text-gray-500 mt-0.5">Monthly payment: <strong>{formatCurrency(selectedLoan.monthly_payment)}</strong></p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KES) *</label>
                <input required type="number" min="1" max={selectedLoan.outstanding} value={repayForm.amount}
                  onChange={e => setRepayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder={`Max: ${formatCurrency(selectedLoan.outstanding, false)}`}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Date</label>
                <input type="date" value={repayForm.payment_date}
                  onChange={e => setRepayForm(f => ({ ...f, payment_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowRepayModal(false)}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {saving ? 'Recording…' : 'Record Repayment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repayment Schedule Modal */}
      {showScheduleModal && selectedLoan && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-display font-semibold text-gray-900">Repayment Schedule — {selectedLoan.reference}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selectedLoan.full_name || 'Your loan'} · {selectedLoan.term_months} months</p>
              </div>
              <button onClick={() => setShowScheduleModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Due Date</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Payment</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Principal</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Interest</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {schedule.map(s => (
                    <tr key={s.installment} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-500">{s.installment}</td>
                      <td className="px-4 py-2.5">{formatDate(s.due_date)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium">{formatCurrency(s.payment)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-600">{formatCurrency(s.principal)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-orange-600">{formatCurrency(s.interest)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700">{formatCurrency(s.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setShowScheduleModal(false)}
                className="w-full border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Loan Product Config Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-display font-semibold text-gray-900">⚙ Loan Products</h2>
              <button onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-5">
              {/* Existing products */}
              {products.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Existing Products</h3>
                  <div className="space-y-2">
                    {products.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                        <div>
                          <span className="font-medium text-gray-900">{p.name}</span>
                          <span className="ml-2 text-gray-500 text-xs">{p.interest_rate}% {p.interest_method} · {p.min_term_months}–{p.max_term_months} mo</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                            {p.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <button onClick={async () => {
                            await api.patch(`/loans/products/${p.id}`, { is_active: !p.is_active });
                            fetchData();
                          }} className="text-xs text-primary-600 hover:underline">Toggle</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add new product form */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Add New Product</h3>
                {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-3">{error}</div>}
                <form onSubmit={handleCreateProduct} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Product Name *</label>
                      <input required value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Development Loan"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Interest Rate (%) *</label>
                      <input required type="number" step="0.01" value={productForm.interest_rate}
                        onChange={e => setProductForm(f => ({ ...f, interest_rate: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
                      <select value={productForm.interest_method} onChange={e => setProductForm(f => ({ ...f, interest_method: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300">
                        <option value="reducing">Reducing Balance</option>
                        <option value="flat">Flat Rate</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Min Amount (KES) *</label>
                      <input required type="number" value={productForm.min_amount}
                        onChange={e => setProductForm(f => ({ ...f, min_amount: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Max Amount (KES) *</label>
                      <input required type="number" value={productForm.max_amount}
                        onChange={e => setProductForm(f => ({ ...f, max_amount: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Min Term (months) *</label>
                      <input required type="number" value={productForm.min_term_months}
                        onChange={e => setProductForm(f => ({ ...f, min_term_months: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Max Term (months) *</label>
                      <input required type="number" value={productForm.max_term_months}
                        onChange={e => setProductForm(f => ({ ...f, max_term_months: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Max Multiplier (× savings)</label>
                      <input type="number" step="0.5" value={productForm.max_multiplier}
                        onChange={e => setProductForm(f => ({ ...f, max_multiplier: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Processing Fee (%)</label>
                      <input type="number" step="0.01" value={productForm.processing_fee_pct}
                        onChange={e => setProductForm(f => ({ ...f, processing_fee_pct: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <textarea value={productForm.description} onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))}
                      rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setShowProductModal(false)}
                      className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
                    <button type="submit" disabled={saving}
                      className="flex-1 bg-primary-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                      {saving ? 'Creating…' : 'Create Product'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
