/**
 * MembersPage.jsx — Full-featured Member Registry
 *
 * NEW FEATURES (002):
 *  - member_no auto-generated but admin can edit it before saving
 *  - nok_name is mandatory (enforced with red asterisk + form validation)
 *  - Second Next of Kin section with "Add 2nd NOK" toggle button
 *  - contribution_pct: slider + number input, 0–100 enforced, cannot exceed 100
 *  - All new fields synced with updated backend controller
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { formatCurrency, formatDate, getInitials } from '../utils/formatters';

/* ─── Design tokens ──────────────────────────────────────────────────── */
const COLOR = {
  active:   { bg: '#ECFDF5', text: '#065F46', dot: '#10B981' },
  pending:  { bg: '#FFFBEB', text: '#92400E', dot: '#F59E0B' },
  suspended:{ bg: '#FEF2F2', text: '#991B1B', dot: '#EF4444' },
  inactive: { bg: '#F3F4F6', text: '#374151', dot: '#9CA3AF' },
  verified: { bg: '#EFF6FF', text: '#1E40AF', dot: '#3B82F6' },
  rejected: { bg: '#FEF2F2', text: '#991B1B', dot: '#EF4444' },
};

const StatusBadge = ({ status }) => {
  const c = COLOR[status] || COLOR.inactive;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: c.bg, color: c.text, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', padding: '3px 8px', borderRadius: 20 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {status?.toUpperCase()}
    </span>
  );
};

const KycBadge = ({ status, onApprove, onReject, canAct }) => {
  const c = COLOR[status] || COLOR.pending;
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => canAct && setOpen(o => !o)} title={canAct ? 'Click to update KYC' : status}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: c.bg, color: c.text, fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', padding: '3px 8px', borderRadius: 20, border: 'none', cursor: canAct ? 'pointer' : 'default' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
        {status?.toUpperCase() || 'PENDING'}
        {canAct && <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>▼</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 140 }}>
          {status !== 'verified' && (
            <button onClick={() => { onApprove(); setOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, color: '#065F46', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}>
              ✓ Approve KYC
            </button>
          )}
          {status !== 'rejected' && (
            <button onClick={() => { onReject(); setOpen(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 13, color: '#991B1B', background: 'none', border: 'none', cursor: 'pointer' }}>
              ✕ Reject KYC
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const Avatar = ({ name, size = 36 }) => {
  const hue = name ? name.charCodeAt(0) * 47 % 360 : 200;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: `hsl(${hue},55%,88%)`, color: `hsl(${hue},55%,30%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 700 }}>
      {getInitials(name)}
    </div>
  );
};

const FieldInput = ({ label, required, children, hint, error }) => (
  <div>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: error ? '#DC2626' : '#6B7280', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {label}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
    </label>
    {children}
    {hint && !error && <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>{hint}</p>}
    {error && <p style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>⚠ {error}</p>}
  </div>
);

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: '1.5px solid #E5E7EB', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: '#111827',
  outline: 'none', background: '#FAFAFA',
  fontFamily: 'inherit', transition: 'border-color 0.15s',
};

const sectionHead = {
  fontSize: 11, fontWeight: 700, color: '#374151',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  borderBottom: '1px solid #F3F4F6',
  paddingBottom: 8, marginBottom: 14, marginTop: 20,
};

/* ─── Contribution Percentage Slider ─────────────────────────────────── */
const PctSlider = ({ value, onChange }) => {
  const pct = parseFloat(value) || 0;
  const color = pct === 100 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="range" min="0" max="100" step="1"
          value={pct}
          onChange={e => onChange(Math.min(100, Math.max(0, parseFloat(e.target.value))))}
          style={{ flex: 1, accentColor: color, cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <input
            type="number" min="0" max="100" step="0.5"
            value={pct}
            onChange={e => {
              let v = parseFloat(e.target.value);
              if (isNaN(v)) v = 0;
              onChange(Math.min(100, Math.max(0, v)));
            }}
            style={{ ...inputStyle, width: 68, textAlign: 'center', fontWeight: 700, color, padding: '7px 8px' }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, color }}>%</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>
        <span>0%</span>
        <span style={{ color, fontWeight: 600 }}>
          {pct === 100 ? '✓ Fully paid' : pct >= 50 ? 'Partial' : 'Under-contributed'}
        </span>
        <span>100%</span>
      </div>
    </div>
  );
};

/* ─── Constants ──────────────────────────────────────────────────────── */
const INITIAL_FORM = {
  full_name: '', email: '', phone: '', id_number: '', gender: '',
  date_of_birth: '', role: 'member', occupation: '', physical_address: '',
  nok_name: '', nok_relationship: '', nok_phone: '', nok_id_number: '',
  nok2_name: '', nok2_relationship: '', nok2_phone: '', nok2_id_number: '',
  contribution_pct: 100,
  custom_member_no: '',
};

const NOK_RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Guardian', 'Friend', 'Other'];

/* ─── Main Component ─────────────────────────────────────────────────── */
export default function MembersPage() {
  const navigate = useNavigate();

  const [members, setMembers]       = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [kycFilter, setKyc]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState(INITIAL_FORM);
  const [saving, setSaving]         = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [toast, setToast]           = useState(null);
  const [kycBusy, setKycBusy]       = useState({});
  const [tempPwd, setTempPwd]       = useState(null);
  const [showSecondNok, setShowSecondNok] = useState(false);
  const [editMemberNo, setEditMemberNo]   = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchMembers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/members', {
        params: { page, limit: 25, search, status: statusFilter || undefined, kyc_status: kycFilter || undefined },
      });
      setMembers(data.data);
      setPagination(data.pagination);
    } catch {
      setToast({ type: 'error', msg: 'Failed to load members. Check your connection.' });
    }
    setLoading(false);
  }, [search, statusFilter, kycFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetchMembers(1), 300);
    return () => clearTimeout(t);
  }, [fetchMembers]);

  const validateForm = () => {
    const errs = {};
    if (!form.full_name?.trim()) errs.full_name = 'Required';
    if (!form.email?.trim()) errs.email = 'Required';
    if (!form.nok_name?.trim()) errs.nok_name = 'Next of kin name is required (SASRA compliance)';
    const pct = parseFloat(form.contribution_pct);
    if (isNaN(pct) || pct < 0 || pct > 100) errs.contribution_pct = 'Must be between 0 and 100';
    if (form.custom_member_no && !/^[A-Z0-9\-]+$/.test(form.custom_member_no)) {
      errs.custom_member_no = 'Only uppercase letters, numbers and hyphens (e.g. MBR-2001)';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.custom_member_no?.trim()) delete payload.custom_member_no;
      const { data } = await api.post('/members', payload);
      setTempPwd({ memberNo: data.data.member_no, name: data.data.full_name, pwd: data.data.temp_password });
      setShowModal(false);
      setForm(INITIAL_FORM);
      setShowSecondNok(false);
      setEditMemberNo(false);
      fetchMembers(1);
    } catch (err) {
      setToast({ type: 'error', msg: err.response?.data?.message || 'Failed to create member' });
    }
    setSaving(false);
  };

  const handleKyc = async (memberId, status) => {
    setKycBusy(b => ({ ...b, [memberId]: true }));
    try {
      await api.patch(`/members/${memberId}/kyc`, { kyc_status: status });
      setMembers(ms => ms.map(m => m.id === memberId ? { ...m, kyc_status: status } : m));
      setToast({ type: 'success', msg: `KYC ${status} for member` });
    } catch {
      setToast({ type: 'error', msg: 'KYC update failed' });
    }
    setKycBusy(b => ({ ...b, [memberId]: false }));
  };

  const set = (field) => (val) => {
    const value = typeof val === 'object' && val?.target ? val.target.value : val;
    setForm(f => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors(fe => { const n = { ...fe }; delete n[field]; return n; });
  };

  /* ── UI ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: toast.type === 'error' ? '#FEF2F2' : '#ECFDF5',
          border: `1px solid ${toast.type === 'error' ? '#FCA5A5' : '#6EE7B7'}`,
          color: toast.type === 'error' ? '#991B1B' : '#065F46',
          borderRadius: 10, padding: '12px 18px', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxWidth: 380,
        }}>
          {toast.type === 'success' ? '✓' : '⚠'} {toast.msg}
          <button onClick={() => setToast(null)} style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6, fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Temp password modal */}
      {tempPwd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 22 }}>🎉</div>
            <h3 style={{ margin: '8px 0 4px', fontSize: 17, fontWeight: 700 }}>Member Created!</h3>
            <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
              <strong>{tempPwd.name}</strong> — <code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 4 }}>{tempPwd.memberNo}</code>
            </p>
            <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', marginBottom: 6 }}>TEMPORARY PASSWORD — share securely</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#78350F', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{tempPwd.pwd}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(tempPwd.pwd); setToast({ type: 'success', msg: 'Password copied!' }); }}
                  style={{ background: '#F59E0B', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  Copy
                </button>
              </div>
            </div>
            <button onClick={() => setTempPwd(null)} style={{ width: '100%', background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Members Registry</h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
            {pagination.total} members · SASRA-compliant KYC tracking
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true); setForm(INITIAL_FORM); setFieldErrors({}); setShowSecondNok(false); setEditMemberNo(false); }}
          style={{ background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          + Add Member
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Search name, email, member no, phone, ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: 280 }}
        />
        <select value={statusFilter} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, width: 150 }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
        <select value={kycFilter} onChange={e => setKyc(e.target.value)} style={{ ...inputStyle, width: 150 }}>
          <option value="">All KYC</option>
          <option value="verified">Verified</option>
          <option value="pending">KYC Pending</option>
          <option value="rejected">KYC Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF' }}>Loading members…</div>
        ) : members.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF' }}>No members found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                {['Member', 'Member No.', 'Savings', 'Shares', 'Loans', 'Contribution %', 'Status', 'KYC', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                  onClick={() => navigate(`/members/${m.id}`)}>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={m.full_name} />
                      <div>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{m.full_name}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF' }}>{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <code style={{ background: '#F3F4F6', padding: '2px 7px', borderRadius: 5, fontSize: 12, color: '#374151' }}>{m.member_no}</code>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#065F46', fontWeight: 500 }}>{formatCurrency(m.savings_balance)}</td>
                  <td style={{ padding: '12px 14px', color: '#1E40AF', fontWeight: 500 }}>{formatCurrency(m.shares_balance)}</td>
                  <td style={{ padding: '12px 14px', color: m.loan_balance > 0 ? '#92400E' : '#6B7280', fontWeight: 500 }}>{formatCurrency(m.loan_balance)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    {m.contribution_pct != null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, maxWidth: 80, height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${m.contribution_pct}%`, background: parseFloat(m.contribution_pct) === 100 ? '#10B981' : parseFloat(m.contribution_pct) >= 50 ? '#F59E0B' : '#EF4444', borderRadius: 3, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{parseFloat(m.contribution_pct).toFixed(0)}%</span>
                      </div>
                    ) : <span style={{ fontSize: 11, color: '#9CA3AF' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                    <StatusBadge status={m.status} />
                  </td>
                  <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                    <KycBadge
                      status={m.kyc_status}
                      canAct={!kycBusy[m.id]}
                      onApprove={() => handleKyc(m.id, 'verified')}
                      onReject={() => handleKyc(m.id, 'rejected')}
                    />
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <button onClick={e => { e.stopPropagation(); navigate(`/members/${m.id}`); }}
                      style={{ background: '#F3F4F6', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: '#374151' }}>
                      View →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => fetchMembers(p)}
              style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid', fontSize: 13, cursor: 'pointer', fontWeight: p === pagination.page ? 700 : 400, background: p === pagination.page ? '#1D4ED8' : '#fff', color: p === pagination.page ? '#fff' : '#374151', borderColor: p === pagination.page ? '#1D4ED8' : '#E5E7EB' }}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Create Member Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '32px 16px' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Member</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9CA3AF' }}>Fields marked <span style={{ color: '#EF4444' }}>*</span> are required</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: 'pointer', color: '#6B7280' }}>×</button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Member Number */}
              <div style={{}}>
                <p style={sectionHead}>Member Number</p>
                <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '10px 14px' }}>
                  {!editMemberNo ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#0369A1', fontWeight: 600, marginBottom: 2 }}>AUTO-GENERATED</div>
                        <div style={{ fontSize: 13, color: '#0C4A6E' }}>Member number will be auto-assigned (e.g. MBR-1042)</div>
                      </div>
                      <button type="button" onClick={() => setEditMemberNo(true)}
                        style={{ background: '#0369A1', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        ✎ Customize
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: '#0369A1', fontWeight: 600 }}>CUSTOM MEMBER NUMBER</div>
                        <button type="button" onClick={() => { setEditMemberNo(false); set('custom_member_no')(''); }}
                          style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 12 }}>
                          ↩ Use auto-generate
                        </button>
                      </div>
                      <FieldInput label="Member Number" error={fieldErrors.custom_member_no} hint="Uppercase letters, numbers, hyphens only (e.g. MBR-2001)">
                        <input style={{ ...inputStyle, borderColor: fieldErrors.custom_member_no ? '#FCA5A5' : '#E5E7EB' }}
                          placeholder="e.g. MBR-2001"
                          value={form.custom_member_no}
                          onChange={e => set('custom_member_no')(e.target.value.toUpperCase())}
                        />
                      </FieldInput>
                    </div>
                  )}
                </div>
              </div>

              {/* Personal Info */}
              <p style={sectionHead}>Personal Information</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <FieldInput label="Full Name" required error={fieldErrors.full_name}>
                  <input style={{ ...inputStyle, borderColor: fieldErrors.full_name ? '#FCA5A5' : '#E5E7EB' }} placeholder="e.g. Jane Wanjiku" value={form.full_name} onChange={set('full_name')} />
                </FieldInput>
                <FieldInput label="Email" required error={fieldErrors.email}>
                  <input type="email" style={{ ...inputStyle, borderColor: fieldErrors.email ? '#FCA5A5' : '#E5E7EB' }} placeholder="jane@email.com" value={form.email} onChange={set('email')} />
                </FieldInput>
                <FieldInput label="Phone" hint="+254 7XX XXX XXX">
                  <input style={inputStyle} placeholder="+254700000000" value={form.phone} onChange={set('phone')} />
                </FieldInput>
                <FieldInput label="National ID No.">
                  <input style={inputStyle} placeholder="12345678" value={form.id_number} onChange={set('id_number')} />
                </FieldInput>
                <FieldInput label="Date of Birth">
                  <input type="date" style={inputStyle} value={form.date_of_birth} onChange={set('date_of_birth')} />
                </FieldInput>
                <FieldInput label="Gender">
                  <select style={inputStyle} value={form.gender} onChange={set('gender')}>
                    <option value="">Select…</option>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </FieldInput>
                <FieldInput label="Occupation">
                  <input style={inputStyle} placeholder="e.g. Teacher" value={form.occupation} onChange={set('occupation')} />
                </FieldInput>
                <FieldInput label="Role">
                  <select style={inputStyle} value={form.role} onChange={set('role')}>
                    <option value="member">Member</option>
                    <option value="treasurer">Treasurer</option>
                    <option value="auditor">Auditor</option>
                    <option value="admin">Admin</option>
                  </select>
                </FieldInput>
              </div>
              <FieldInput label="Physical Address">
                <input style={inputStyle} placeholder="e.g. Westlands, Nairobi" value={form.physical_address} onChange={set('physical_address')} />
              </FieldInput>

              {/* Contribution Percentage */}
              <p style={sectionHead}>Contribution Percentage</p>
              <FieldInput label="Contribution Level (0–100%)" error={fieldErrors.contribution_pct}
                hint="Tracks what % of standard monthly contributions this member has committed to">
                <PctSlider value={form.contribution_pct} onChange={v => set('contribution_pct')(v)} />
              </FieldInput>

              {/* Primary NOK */}
              <p style={sectionHead}>Next of Kin — Primary <span style={{ color: '#EF4444' }}>*</span></p>
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: 14 }}>
                <p style={{ fontSize: 11, color: '#92400E', margin: '0 0 12px', fontWeight: 600 }}>⚠ SASRA requires at least one next of kin. Full name is mandatory.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <FieldInput label="NOK Full Name" required error={fieldErrors.nok_name}>
                    <input style={{ ...inputStyle, borderColor: fieldErrors.nok_name ? '#FCA5A5' : '#E5E7EB' }}
                      placeholder="e.g. John Kamau"
                      value={form.nok_name} onChange={set('nok_name')} />
                  </FieldInput>
                  <FieldInput label="Relationship">
                    <select style={inputStyle} value={form.nok_relationship} onChange={set('nok_relationship')}>
                      <option value="">Select…</option>
                      {NOK_RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </FieldInput>
                  <FieldInput label="NOK Phone">
                    <input style={inputStyle} placeholder="+254700000000" value={form.nok_phone} onChange={set('nok_phone')} />
                  </FieldInput>
                  <FieldInput label="NOK National ID">
                    <input style={inputStyle} placeholder="12345678" value={form.nok_id_number} onChange={set('nok_id_number')} />
                  </FieldInput>
                </div>
              </div>

              {/* Second NOK */}
              {!showSecondNok ? (
                <button type="button"
                  onClick={() => setShowSecondNok(true)}
                  style={{ alignSelf: 'flex-start', background: '#F0FDF4', color: '#15803D', border: '1.5px dashed #86EFAC', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  + Add 2nd Next of Kin (Optional)
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <p style={{ ...sectionHead, margin: 0 }}>Next of Kin — Secondary</p>
                    <button type="button" onClick={() => { setShowSecondNok(false); set('nok2_name')(''); set('nok2_relationship')(''); set('nok2_phone')(''); set('nok2_id_number')(''); }}
                      style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 12 }}>Remove 2nd NOK</button>
                  </div>
                  <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 10, padding: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <FieldInput label="NOK 2 Full Name">
                        <input style={inputStyle} placeholder="e.g. Mary Njeri" value={form.nok2_name} onChange={set('nok2_name')} />
                      </FieldInput>
                      <FieldInput label="Relationship">
                        <select style={inputStyle} value={form.nok2_relationship} onChange={set('nok2_relationship')}>
                          <option value="">Select…</option>
                          {NOK_RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </FieldInput>
                      <FieldInput label="NOK 2 Phone">
                        <input style={inputStyle} placeholder="+254700000000" value={form.nok2_phone} onChange={set('nok2_phone')} />
                      </FieldInput>
                      <FieldInput label="NOK 2 National ID">
                        <input style={inputStyle} placeholder="12345678" value={form.nok2_id_number} onChange={set('nok2_id_number')} />
                      </FieldInput>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ flex: 1, background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 2, background: saving ? '#9CA3AF' : '#1D4ED8', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', transition: 'background 0.2s' }}>
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
