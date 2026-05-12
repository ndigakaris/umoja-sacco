/**
 * WelfarePage.jsx — Full Welfare Case Management with Live Filters
 *
 * CHANGES:
 *  - Date/month/year/period filters — all re-query live API data
 *  - Today / Last week / Last month / Last 3 months / Last 6 months / Custom
 *  - 'other' category with free-text reason field
 *  - Welfare open amount (no min/max)
 *  - Summary KPIs update with every filter change
 *  - Total Welfare prominently displayed with filtered breakdown
 */

import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

/* ─── helpers ────────────────────────────────────────────────────────────── */
const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
};
const startOfMonth = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() - offset, 1);
  return d.toISOString().split('T')[0];
};
const endOfMonth = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() - offset + 1, 0);
  return d.toISOString().split('T')[0];
};

const QUICK_FILTERS = [
  { label: 'Today',        from: () => today(),         to: () => today() },
  { label: 'Last 7 days',  from: () => daysAgo(7),      to: () => today() },
  { label: 'This month',   from: () => startOfMonth(0), to: () => today() },
  { label: 'Last month',   from: () => startOfMonth(1), to: () => endOfMonth(1) },
  { label: 'Last 3 months',from: () => startOfMonth(3), to: () => today() },
  { label: 'Last 6 months',from: () => startOfMonth(6), to: () => today() },
  { label: 'This year',    from: () => `${new Date().getFullYear()}-01-01`, to: () => today() },
];

const CATEGORIES = [
  { value:'bereavement', label:'Bereavement' },
  { value:'illness',     label:'Illness' },
  { value:'emergency',   label:'Emergency' },
  { value:'disability',  label:'Disability' },
  { value:'education',   label:'Education' },
  { value:'other',       label:'Other (specify)' },
];

const STATUS_STYLE = {
  pending:  { bg:'#FFFBEB', color:'#92400E', border:'#FCD34D', dot:'#F59E0B' },
  approved: { bg:'#EFF6FF', color:'#1E40AF', border:'#BFDBFE', dot:'#3B82F6' },
  rejected: { bg:'#FEF2F2', color:'#991B1B', border:'#FECACA', dot:'#EF4444' },
  disbursed:{ bg:'#ECFDF5', color:'#065F46', border:'#A7F3D0', dot:'#10B981' },
};

const inp = {
  boxSizing:'border-box', border:'1.5px solid #E5E7EB', borderRadius:8,
  padding:'8px 12px', fontSize:13, color:'#111827', outline:'none',
  background:'#FAFAFA', fontFamily:'inherit', width:'100%',
};

function Toast({ msg, type, onDismiss }) {
  useEffect(() => { const t = setTimeout(onDismiss, 5000); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position:'fixed', top:20, right:20, zIndex:999,
      background: type==='success'?'#ECFDF5':'#FEF2F2',
      color: type==='success'?'#065F46':'#991B1B',
      border:`1px solid ${type==='success'?'#A7F3D0':'#FECACA'}`,
      borderRadius:12, padding:'12px 18px', fontSize:13, fontWeight:500,
      boxShadow:'0 8px 24px rgba(0,0,0,0.1)', display:'flex', gap:10, alignItems:'center', maxWidth:420,
    }}>
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onDismiss} style={{ background:'none', border:'none', cursor:'pointer', fontSize:16, opacity:0.5 }}>×</button>
    </div>
  );
}

/* ─── Main ────────────────────────────────────────────────────────────────── */
export default function WelfarePage() {
  const { user } = useAuth();
  const isAdmin = ['admin','treasurer','auditor'].includes(user?.role);
  const canReview = ['admin','treasurer'].includes(user?.role);

  const [cases, setCases]         = useState([]);
  const [summary, setSummary]     = useState({});
  const [members, setMembers]     = useState([]);
  const [poolBalance, setPool]    = useState(null);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState(null);

  // Filters
  const [statusFilter, setStatus]   = useState('all');
  const [catFilter, setCat]         = useState('');
  const [from, setFrom]             = useState('');
  const [to, setTo]                 = useState('');
  const [quickLabel, setQuickLabel] = useState('');
  const [customDates, setCustom]    = useState(false);

  // Modals
  const [showFile, setShowFile]     = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [selCase, setSelCase]       = useState(null);
  const [saving, setSaving]         = useState(false);
  const [modalError, setModalError] = useState('');

  const [fileForm, setFileForm] = useState({
    user_id:'', category:'bereavement', amount:'', description:'', other_reason:'',
  });
  const [reviewForm, setReviewForm] = useState({ status:'approved', review_note:'' });

  /* fetch — called whenever any filter changes ─────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (catFilter)   params.category = catFilter;
      if (from)        params.from = from;
      if (to)          params.to   = to;
      params.limit = 200;

      const [wRes, memRes] = await Promise.all([
        api.get('/welfare', { params }),
        isAdmin
          ? api.get('/members', { params:{ limit:200 } })
          : Promise.resolve({ data:{ data:[] } }),
      ]);

      setCases(wRes.data.data || []);
      setSummary(wRes.data.summary || {});
      setMembers(memRes.data.data || []);

      if (isAdmin) {
        try { const p = await api.get('/welfare/pool-balance'); setPool(p.data.data?.pool_balance); } catch {}
      }
    } catch(e) {
      setToast({ type:'error', msg: e.response?.data?.message || 'Failed to load welfare cases' });
    }
    setLoading(false);
  }, [statusFilter, catFilter, from, to, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyQuick = (qf) => {
    setQuickLabel(qf.label);
    setFrom(qf.from());
    setTo(qf.to());
    setCustom(false);
  };

  const clearDates = () => { setFrom(''); setTo(''); setQuickLabel(''); };

  /* file case ──────────────────────────────────────────────────────────── */
  const handleFile = async (e) => {
    e.preventDefault(); setSaving(true); setModalError('');
    try {
      await api.post('/welfare', {
        ...fileForm,
        user_id: isAdmin && fileForm.user_id ? fileForm.user_id : undefined,
      });
      setToast({ type:'success', msg:'Welfare case filed successfully' });
      setShowFile(false);
      setFileForm({ user_id:'', category:'bereavement', amount:'', description:'', other_reason:'' });
      fetchData();
    } catch(err) { setModalError(err.response?.data?.message || 'Failed to file case'); }
    setSaving(false);
  };

  /* review/disburse ────────────────────────────────────────────────────── */
  const handleReview = async (e) => {
    e.preventDefault(); setSaving(true); setModalError('');
    try {
      const { data } = await api.patch(`/welfare/${selCase.id}/review`, reviewForm);
      let msg = `Case ${reviewForm.status}`;
      if (data.data?.savings_fallback) msg += ' — Pool insufficient, funded from member savings';
      setToast({ type:'success', msg });
      setShowReview(false);
      fetchData();
    } catch(err) { setModalError(err.response?.data?.message || 'Failed'); }
    setSaving(false);
  };

  const openReview = (wc, forceStatus) => {
    setSelCase(wc);
    setReviewForm({ status: forceStatus || 'approved', review_note:'' });
    setModalError('');
    setShowReview(true);
  };

  /* ─── render ─────────────────────────────────────────────────────────── */
  return (
    <div style={{ fontFamily:'inherit', paddingBottom:48 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#111827', margin:0, letterSpacing:'-0.03em' }}>Welfare</h1>
          <p style={{ color:'#9CA3AF', fontSize:13, marginTop:4 }}>Member welfare fund — SASRA regulated</p>
        </div>
        <button onClick={() => { setShowFile(true); setModalError(''); }}
          style={{ background:'#7C3AED', color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 2px 8px rgba(124,58,237,0.3)' }}>
          + File Case
        </button>
      </div>

      {/* KPI Cards — live with filters */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Welfare',  val: formatCurrency(summary.total_amount),    accent:'#7C3AED', icon:'🤝' },
          { label:'Disbursed',      val: formatCurrency(summary.disbursed_amount), accent:'#10B981', icon:'💸' },
          { label:'Pending',        val: formatCurrency(summary.pending_amount),   accent:'#F59E0B', icon:'⏳' },
          { label:'Total Cases',    val: summary.total_cases || 0,                 accent:'#6B7280', icon:'📋', raw:true },
        ].map(c => (
          <div key={c.label} style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:c.accent, borderRadius:'14px 14px 0 0' }} />
            <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', letterSpacing:'0.07em', textTransform:'uppercase', marginBottom:8 }}>{c.icon} {c.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:'#111827', fontFamily: c.raw?'inherit':'monospace' }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Pool balance */}
      {isAdmin && poolBalance !== null && (
        <div style={{ background: parseFloat(poolBalance)<10000?'#FEF2F2':'#EFF6FF', border:`1px solid ${parseFloat(poolBalance)<10000?'#FECACA':'#BFDBFE'}`, borderRadius:10, padding:'12px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, color: parseFloat(poolBalance)<10000?'#991B1B':'#1E40AF', fontWeight:500 }}>
            {parseFloat(poolBalance)<10000 ? '⚠ ' : '💰 '}Welfare Pool Balance
            {parseFloat(poolBalance)<10000 ? ' — Pool is low. Disbursements may fall back to member savings.' : ''}
          </span>
          <span style={{ fontSize:18, fontWeight:700, fontFamily:'monospace', color: parseFloat(poolBalance)<10000?'#DC2626':'#1D4ED8' }}>
            {formatCurrency(poolBalance)}
          </span>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:'16px 20px', marginBottom:16 }}>
        {/* Quick filters */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
          {QUICK_FILTERS.map(qf => (
            <button key={qf.label} onClick={() => applyQuick(qf)} style={{
              padding:'5px 12px', border:`1.5px solid ${quickLabel===qf.label?'#7C3AED':'#E5E7EB'}`,
              borderRadius:20, background: quickLabel===qf.label?'#F5F3FF':'#fff',
              color: quickLabel===qf.label?'#7C3AED':'#6B7280',
              fontSize:12, fontWeight:600, cursor:'pointer',
            }}>{qf.label}</button>
          ))}
          <button onClick={() => { setCustom(c => !c); setQuickLabel(''); }} style={{
            padding:'5px 12px', border:`1.5px solid ${customDates?'#7C3AED':'#E5E7EB'}`,
            borderRadius:20, background: customDates?'#F5F3FF':'#fff',
            color: customDates?'#7C3AED':'#6B7280', fontSize:12, fontWeight:600, cursor:'pointer',
          }}>Custom dates</button>
          {(from || to || quickLabel) && (
            <button onClick={clearDates} style={{ padding:'5px 12px', border:'1.5px solid #FECACA', borderRadius:20, background:'#FEF2F2', color:'#991B1B', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              Clear ×
            </button>
          )}
        </div>

        {/* Custom date inputs */}
        {customDates && (
          <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inp, width:160 }} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inp, width:160 }} />
            </div>
          </div>
        )}

        {/* Status + Category filters */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Status</label>
            <div style={{ display:'flex', gap:4 }}>
              {['all','pending','approved','disbursed','rejected'].map(s => (
                <button key={s} onClick={() => setStatus(s)} style={{
                  padding:'5px 12px', border:`1.5px solid ${statusFilter===s?'#1D4ED8':'#E5E7EB'}`,
                  borderRadius:8, background: statusFilter===s?'#EFF6FF':'#fff',
                  color: statusFilter===s?'#1D4ED8':'#6B7280',
                  fontSize:12, fontWeight:600, cursor:'pointer', textTransform:'capitalize',
                }}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Category</label>
            <select value={catFilter} onChange={e => setCat(e.target.value)} style={{ ...inp, width:'auto', cursor:'pointer' }}>
              <option value="">All categories</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {(from || to) && (
          <p style={{ fontSize:11, color:'#7C3AED', marginTop:8, fontWeight:500 }}>
            Showing {from ? formatDate(from) : '—'} to {to ? formatDate(to) : 'today'}
            {summary.total_cases ? ` · ${summary.total_cases} cases` : ''}
          </p>
        )}
      </div>

      {/* Cases list */}
      {loading ? (
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:'60px 20px', textAlign:'center', color:'#9CA3AF' }}>
          <div style={{ width:28, height:28, border:'3px solid #E5E7EB', borderTopColor:'#7C3AED', borderRadius:'50%', margin:'0 auto 12px', animation:'spin 0.8s linear infinite' }} />
          Loading welfare cases…
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : cases.length === 0 ? (
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:'60px 20px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🤝</div>
          <p style={{ color:'#6B7280', fontSize:14 }}>No welfare cases found for the selected filters</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {cases.map(wc => {
            const sc = STATUS_STYLE[wc.status] || STATUS_STYLE.pending;
            return (
              <div key={wc.id} style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:'16px 20px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:200 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                      <span style={{ fontWeight:700, fontSize:14, color:'#111827' }}>{wc.full_name}</span>
                      <span style={{ fontSize:11, color:'#9CA3AF' }}>{wc.member_no}</span>
                      <code style={{ fontSize:11, background:'#F3F4F6', color:'#374151', padding:'2px 6px', borderRadius:4 }}>{wc.reference}</code>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em' }}>
                        <span style={{ width:5, height:5, borderRadius:'50%', background:sc.dot }} />
                        {wc.status}
                      </span>
                    </div>
                    <div style={{ fontSize:13, color:'#374151', marginBottom:4 }}>
                      <span style={{ textTransform:'capitalize', fontWeight:600 }}>{wc.category?.replace(/_/g,' ')}</span>
                      {' — '}
                      <span style={{ fontWeight:700, color:'#7C3AED', fontFamily:'monospace' }}>{formatCurrency(wc.amount)}</span>
                    </div>
                    {wc.description && <p style={{ fontSize:13, color:'#6B7280', margin:'4px 0' }}>{wc.description}</p>}
                    {wc.review_note && <p style={{ fontSize:12, color:'#92400E', background:'#FFFBEB', borderRadius:6, padding:'4px 8px', margin:'4px 0', display:'inline-block' }}>Note: {wc.review_note}</p>}
                    <p style={{ fontSize:11, color:'#9CA3AF', marginTop:6 }}>
                      Filed {formatDate(wc.filed_date, 'long')}
                      {wc.reviewed_by_name && ` · Reviewed by ${wc.reviewed_by_name}`}
                      {wc.disbursed_at && ` · Disbursed ${formatDate(wc.disbursed_at)}`}
                    </p>
                  </div>

                  {canReview && (
                    <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                      {wc.status === 'pending' && (
                        <>
                          <button onClick={() => openReview(wc, 'approved')} style={{ background:'#ECFDF5', color:'#065F46', border:'1px solid #A7F3D0', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                            ✓ Approve
                          </button>
                          <button onClick={() => openReview(wc, 'rejected')} style={{ background:'#FEF2F2', color:'#991B1B', border:'1px solid #FECACA', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                            ✕ Reject
                          </button>
                        </>
                      )}
                      {wc.status === 'approved' && (
                        <button onClick={() => openReview(wc, 'disbursed')} style={{ background:'#1D4ED8', color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          💸 Disburse
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── File Case Modal ─────────────────────────────────────────────── */}
      {showFile && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:16 }}>
          <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:480, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h2 style={{ fontSize:17, fontWeight:700, color:'#111827', margin:0 }}>File Welfare Case</h2>
              <button onClick={() => setShowFile(false)} style={{ background:'none', border:'none', fontSize:22, color:'#9CA3AF', cursor:'pointer' }}>×</button>
            </div>
            <form onSubmit={handleFile} style={{ padding:'20px 24px' }}>
              {modalError && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#991B1B', marginBottom:16 }}>{modalError}</div>}

              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {isAdmin && (
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Member</label>
                    <select value={fileForm.user_id} onChange={e => setFileForm(f => ({...f, user_id:e.target.value}))} style={{ ...inp, cursor:'pointer' }}>
                      <option value="">Filing for self</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.full_name} — {m.member_no}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Category *</label>
                  <select required value={fileForm.category} onChange={e => setFileForm(f => ({...f, category:e.target.value}))} style={{ ...inp, cursor:'pointer' }}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                {/* 'other' reason field */}
                {fileForm.category === 'other' && (
                  <div>
                    <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Reason for Other *</label>
                    <input required value={fileForm.other_reason} onChange={e => setFileForm(f => ({...f, other_reason:e.target.value}))}
                      placeholder="Describe the specific welfare need…" style={inp} />
                  </div>
                )}

                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Amount (KES) *</label>
                  <input required type="number" min="1" step="1" value={fileForm.amount}
                    onChange={e => setFileForm(f => ({...f, amount:e.target.value}))}
                    placeholder="Enter amount — no minimum" style={inp} />
                  <p style={{ fontSize:11, color:'#9CA3AF', marginTop:3 }}>Amount is open — enter what is needed</p>
                </div>

                <div>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Description / Supporting Details</label>
                  <textarea value={fileForm.description} onChange={e => setFileForm(f => ({...f, description:e.target.value}))}
                    rows={3} placeholder="Briefly describe the welfare need and circumstances…"
                    style={{ ...inp, resize:'vertical' }} />
                </div>
              </div>

              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button type="button" onClick={() => setShowFile(false)} style={{ flex:1, background:'#F3F4F6', color:'#374151', border:'none', borderRadius:10, padding:11, fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ flex:2, background: saving?'#A78BFA':'#7C3AED', color:'#fff', border:'none', borderRadius:10, padding:11, fontSize:13, fontWeight:700, cursor: saving?'not-allowed':'pointer' }}>
                  {saving ? 'Filing…' : 'File Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Review / Disburse Modal ──────────────────────────────────────── */}
      {showReview && selCase && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:16 }}>
          <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:440, boxShadow:'0 24px 64px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h2 style={{ fontSize:17, fontWeight:700, color:'#111827', margin:0 }}>
                {reviewForm.status === 'disbursed' ? '💸 Disburse' : reviewForm.status === 'rejected' ? '✕ Reject' : '✓ Approve'} — {selCase.reference}
              </h2>
              <button onClick={() => setShowReview(false)} style={{ background:'none', border:'none', fontSize:22, color:'#9CA3AF', cursor:'pointer' }}>×</button>
            </div>
            <form onSubmit={handleReview} style={{ padding:'20px 24px' }}>
              {modalError && <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#991B1B', marginBottom:16 }}>{modalError}</div>}

              <div style={{ background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:10, padding:'12px 14px', marginBottom:16 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, fontSize:13 }}>
                  {[['Member', selCase.full_name], ['Category', selCase.category], ['Amount', formatCurrency(selCase.amount)], ['Filed', formatDate(selCase.filed_date)]].map(([l,v]) => (
                    <div key={l}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>{l}</div>
                      <div style={{ fontSize:13, fontWeight:600, color:'#111827', textTransform:'capitalize' }}>{v}</div>
                    </div>
                  ))}
                </div>
                {selCase.description && <p style={{ fontSize:12, color:'#6B7280', marginTop:8, paddingTop:8, borderTop:'1px solid #E5E7EB' }}>{selCase.description}</p>}
              </div>

              {reviewForm.status === 'disbursed' && poolBalance !== null && parseFloat(poolBalance) < parseFloat(selCase.amount) && (
                <div style={{ background:'#FFFBEB', border:'1px solid #FCD34D', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#92400E', marginBottom:14 }}>
                  ⚠ Pool has {formatCurrency(poolBalance)} — shortfall will come from member savings.
                </div>
              )}

              {reviewForm.status !== 'disbursed' && (
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Decision</label>
                  <select value={reviewForm.status} onChange={e => setReviewForm(f => ({...f, status:e.target.value}))} style={{ ...inp, cursor:'pointer' }}>
                    <option value="approved">Approve</option>
                    <option value="rejected">Reject</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>
                  Review Note {reviewForm.status === 'rejected' ? '*' : '(optional)'}
                </label>
                <textarea value={reviewForm.review_note} onChange={e => setReviewForm(f => ({...f, review_note:e.target.value}))}
                  rows={2} placeholder="Note to member…" required={reviewForm.status === 'rejected'}
                  style={{ ...inp, resize:'vertical' }} />
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button type="button" onClick={() => setShowReview(false)} style={{ flex:1, background:'#F3F4F6', color:'#374151', border:'none', borderRadius:10, padding:11, fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{
                  flex:2, border:'none', borderRadius:10, padding:11, fontSize:13, fontWeight:700, cursor: saving?'not-allowed':'pointer', color:'#fff',
                  background: saving?'#9CA3AF': reviewForm.status==='rejected'?'#DC2626': reviewForm.status==='disbursed'?'#1D4ED8':'#059669',
                }}>
                  {saving ? 'Processing…' : reviewForm.status==='disbursed' ? '💸 Confirm Disbursement' : reviewForm.status==='rejected' ? 'Reject Case' : 'Approve Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
