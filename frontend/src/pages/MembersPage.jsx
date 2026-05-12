/**
 * MembersPage.jsx — SASRA-Compliant Member Registry with KYC Management
 *
 * BUGS FIXED vs original:
 *  1. Added KYC filter (backend supported it, frontend never sent it)
 *  2. Added date_of_birth field to create form (was missing, schema requires it)
 *  3. Added click-through to MemberProfilePage (/members/:id)
 *  4. Added inline KYC approve/reject action directly from the list
 *  5. Fixed pagination state not resetting when search/filter changes (was on page 2+)
 *  6. Fixed success banner not auto-dismissing (UX fix)
 *  7. Added kyc_filter to fetchMembers params (was ignored before)
 *  8. Added phone formatting hint (Kenyan +254 format)
 *  9. Exposed temp_password copy button (previously only in a banner that could be missed)
 * 10. Correct INITIAL_FORM reset after successful create
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

/* ─── Sub-components ─────────────────────────────────────────────────── */

const StatusBadge = ({ status }) => {
  const c = COLOR[status] || COLOR.inactive;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
      padding: '3px 8px', borderRadius: 20,
    }}>
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
      <button
        onClick={() => canAct && setOpen(o => !o)}
        title={canAct ? 'Click to update KYC' : status}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: c.bg, color: c.text,
          fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
          padding: '3px 8px', borderRadius: 20,
          border: 'none', cursor: canAct ? 'pointer' : 'default',
        }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
        {status?.toUpperCase() || 'PENDING'}
        {canAct && <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>▼</span>}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 100,
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 140,
        }}>
          {status !== 'verified' && (
            <button onClick={() => { onApprove(); setOpen(false); }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '9px 14px', fontSize: 13, color: '#065F46',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: '1px solid #F3F4F6',
            }}>
              ✓ Approve KYC
            </button>
          )}
          {status !== 'rejected' && (
            <button onClick={() => { onReject(); setOpen(false); }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '9px 14px', fontSize: 13, color: '#991B1B',
              background: 'none', border: 'none', cursor: 'pointer',
            }}>
              ✕ Reject KYC
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const Avatar = ({ name, size = 36 }) => {
  const initials = getInitials(name);
  const hue = name ? name.charCodeAt(0) * 47 % 360 : 200;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${hue},55%,88%)`, color: `hsl(${hue},55%,30%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, letterSpacing: '-0.02em',
    }}>
      {initials}
    </div>
  );
};

const FieldInput = ({ label, required, children, hint }) => (
  <div>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6B7280', marginBottom: 5, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {label}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
    </label>
    {children}
    {hint && <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>{hint}</p>}
  </div>
);

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: '1.5px solid #E5E7EB', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: '#111827',
  outline: 'none', background: '#FAFAFA',
  fontFamily: 'inherit', transition: 'border-color 0.15s',
};

/* ─── Constants ──────────────────────────────────────────────────────── */
const INITIAL_FORM = {
  full_name: '', email: '', phone: '', id_number: '', gender: '',
  date_of_birth: '', role: 'member', occupation: '', physical_address: '',
  nok_name: '', nok_relationship: '', nok_phone: '',
};

const NOK_RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Guardian', 'Friend', 'Other'];

/* ─── Main Component ─────────────────────────────────────────────────── */
export default function MembersPage() {
  const navigate = useNavigate();

  const [members, setMembers]       = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatus]   = useState('');
  const [kycFilter, setKyc]         = useState('');          // FIX #1: was never wired up
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState(INITIAL_FORM);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [toast, setToast]           = useState(null);        // FIX #6: auto-dismiss toast
  const [kycBusy, setKycBusy]       = useState({});          // track per-row KYC requests
  const [tempPwd, setTempPwd]       = useState(null);        // FIX #9: show temp password in modal

  // Auto-dismiss toast after 6s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  /* fetch ─────────────────────────────────────────────────────────────── */
  const fetchMembers = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/members', {
        params: {
          page, limit: 25, search,
          status: statusFilter || undefined,
          kyc_status: kycFilter || undefined,   // FIX #7: was never sent
        },
      });
      setMembers(data.data);
      setPagination(data.pagination);
    } catch {
      setToast({ type: 'error', msg: 'Failed to load members. Check your connection.' });
    }
    setLoading(false);
  }, [search, statusFilter, kycFilter]);

  // FIX #5: reset to page 1 when filters change
  useEffect(() => {
    const t = setTimeout(() => fetchMembers(1), 300);
    return () => clearTimeout(t);
  }, [fetchMembers]);

  /* create member ─────────────────────────────────────────────────────── */
  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/members', form);
      setTempPwd(data.data.temp_password);       // FIX #9: store for display
      setForm(INITIAL_FORM);                     // FIX #10: always reset
      fetchMembers(1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create member');
    }
    setSaving(false);
  };

  const closeModal = () => {
    setShowModal(false);
    setError('');
    setTempPwd(null);
    setForm(INITIAL_FORM);
  };

  /* KYC update ─────────────────────────────────────────────────────────── */
  const handleKyc = async (memberId, memberName, kyc_status) => {
    setKycBusy(b => ({ ...b, [memberId]: true }));
    try {
      await api.patch(`/members/${memberId}/kyc`, { kyc_status });
      setMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, kyc_status } : m
      ));
      setToast({ type: 'success', msg: `KYC for ${memberName} set to ${kyc_status}` });
    } catch {
      setToast({ type: 'error', msg: 'KYC update failed' });
    }
    setKycBusy(b => ({ ...b, [memberId]: false }));
  };

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '0 0 40px', fontFamily: 'inherit' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          background: toast.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          color: toast.type === 'success' ? '#065F46' : '#991B1B',
          border: `1px solid ${toast.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
          borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxWidth: 360,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.5, padding: 0 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.03em' }}>Members</h1>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '4px 0 0', letterSpacing: '0.01em' }}>
            {loading ? 'Loading…' : `${pagination.total.toLocaleString()} registered members · SASRA compliant`}
          </p>
        </div>
        <button
          onClick={() => { setShowModal(true); setError(''); setTempPwd(null); }}
          style={{
            background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 10,
            padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '0.01em',
            boxShadow: '0 2px 8px rgba(29,78,216,0.3)',
          }}>
          + Enrol Member
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9CA3AF' }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, ID, phone…"
            style={{ ...inputStyle, paddingLeft: 34, width: '100%' }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
        {/* FIX #1: KYC filter now wired */}
        <select value={kycFilter} onChange={e => setKyc(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
          <option value="">All KYC</option>
          <option value="pending">KYC Pending</option>
          <option value="verified">KYC Verified</option>
          <option value="rejected">KYC Rejected</option>
        </select>
      </div>

      {/* KYC summary pills */}
      {!loading && kycFilter === '' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Pending KYC', val: 'pending', color: '#92400E', bg: '#FFFBEB' },
            { label: 'Verified',    val: 'verified', color: '#1E40AF', bg: '#EFF6FF' },
            { label: 'Rejected',    val: 'rejected', color: '#991B1B', bg: '#FEF2F2' },
          ].map(p => (
            <button key={p.val} onClick={() => setKyc(p.val)} style={{
              background: p.bg, color: p.color, border: 'none',
              borderRadius: 20, padding: '5px 14px', fontSize: 12,
              fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em',
            }}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: '#9CA3AF' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #E5E7EB', borderTopColor: '#1D4ED8', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
            Loading members…
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: '64px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>No members found</p>
            <p style={{ color: '#D1D5DB', fontSize: 12, marginTop: 4 }}>Try adjusting your search or filters</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['Member', 'Contact', 'Savings', 'Shares', 'Active Loans', 'Status', 'KYC', 'Joined', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: h === '' || h === 'Member' || h === 'Contact' || h === 'Status' || h === 'KYC' || h === 'Joined' ? 'left' : 'right',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                      color: '#9CA3AF', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, idx) => (
                  <tr
                    key={m.id}
                    style={{ borderBottom: idx < members.length - 1 ? '1px solid #F3F4F6' : 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Member */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={m.full_name} />
                        <div>
                          <div style={{ fontWeight: 600, color: '#111827' }}>{m.full_name}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{m.member_no}</div>
                        </div>
                      </div>
                    </td>
                    {/* Contact */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ color: '#374151' }}>{m.email}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{m.phone || '—'}</div>
                    </td>
                    {/* Savings */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#374151' }}>
                      {formatCurrency(m.savings_balance)}
                    </td>
                    {/* Shares */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace', color: '#374151' }}>
                      {formatCurrency(m.shares_balance)}
                    </td>
                    {/* Loans */}
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontFamily: 'monospace', color: parseFloat(m.loan_balance) > 0 ? '#991B1B' : '#374151' }}>
                      {formatCurrency(m.loan_balance)}
                    </td>
                    {/* Status */}
                    <td style={{ padding: '12px 14px' }}><StatusBadge status={m.status} /></td>
                    {/* KYC — FIX #4: inline approve/reject */}
                    <td style={{ padding: '12px 14px', opacity: kycBusy[m.id] ? 0.5 : 1 }}>
                      <KycBadge
                        status={m.kyc_status || 'pending'}
                        canAct={true}
                        onApprove={() => handleKyc(m.id, m.full_name, 'verified')}
                        onReject={() => handleKyc(m.id, m.full_name, 'rejected')}
                      />
                    </td>
                    {/* Joined */}
                    <td style={{ padding: '12px 14px', color: '#9CA3AF', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {formatDate(m.created_at)}
                    </td>
                    {/* FIX #3: Click-through to profile */}
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        onClick={() => navigate(`/members/${m.id}`)}
                        style={{
                          background: '#F3F4F6', color: '#374151', border: 'none',
                          borderRadius: 7, padding: '5px 12px', fontSize: 12,
                          fontWeight: 600, cursor: 'pointer',
                        }}>
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 13, color: '#6B7280' }}>
          <span>Page {pagination.page} of {pagination.pages} · {pagination.total} total</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={pagination.page <= 1} onClick={() => fetchMembers(pagination.page - 1)}
              style={{ padding: '6px 14px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, opacity: pagination.page <= 1 ? 0.4 : 1 }}>
              ← Prev
            </button>
            <button disabled={pagination.page >= pagination.pages} onClick={() => fetchMembers(pagination.page + 1)}
              style={{ padding: '6px 14px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, opacity: pagination.page >= pagination.pages ? 0.4 : 1 }}>
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ─── Create Member Modal ─────────────────────────────────────────── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 500, padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 18, width: '100%', maxWidth: 580,
            maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
          }}>
            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#111827' }}>Enrol New Member</h2>
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: '3px 0 0' }}>SASRA KYC — all fields marked * are required</p>
              </div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            {/* Success (temp password) state — FIX #9 */}
            {tempPwd ? (
              <div style={{ padding: 24 }}>
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: '#065F46', fontSize: 15, marginBottom: 8 }}>✓ Member enrolled successfully!</div>
                  <p style={{ fontSize: 13, color: '#047857', margin: '0 0 12px' }}>Share this temporary password with the member — they must change it on first login.</p>
                  <div style={{ background: '#fff', border: '1px solid #D1FAE5', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.05em', color: '#065F46' }}>{tempPwd}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(tempPwd).then(() => setToast({ type: 'success', msg: 'Copied to clipboard!' }))}
                      style={{ background: '#D1FAE5', border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#065F46', cursor: 'pointer' }}>
                      Copy
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setTempPwd(null); }} style={{ flex: 1, background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    + Add Another
                  </button>
                  <button onClick={closeModal} style={{ flex: 1, background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate}>
                <div style={{ padding: '20px 24px' }}>
                  {error && (
                    <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991B1B', marginBottom: 16 }}>
                      {error}
                    </div>
                  )}

                  {/* Section: Personal Info */}
                  <div style={{ marginBottom: 20 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, height: 1, background: '#F3F4F6' }} /> Personal Information <span style={{ flex: 1, height: 1, background: '#F3F4F6' }} />
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <FieldInput label="Full Name" required>
                          <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                            placeholder="As per National ID" style={inputStyle} />
                        </FieldInput>
                      </div>
                      <FieldInput label="Email" required>
                        <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                          placeholder="member@example.com" style={inputStyle} />
                      </FieldInput>
                      <FieldInput label="Phone" hint="+254 7XX XXX XXX">
                        <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                          placeholder="+254700000000" style={inputStyle} />
                      </FieldInput>
                      <FieldInput label="National ID Number">
                        <input value={form.id_number} onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))}
                          placeholder="12345678" style={inputStyle} />
                      </FieldInput>
                      {/* FIX #2: date_of_birth was missing */}
                      <FieldInput label="Date of Birth">
                        <input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
                          style={inputStyle} />
                      </FieldInput>
                      <FieldInput label="Gender">
                        <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="">Select</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </FieldInput>
                      <FieldInput label="Role">
                        <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="member">Member</option>
                          <option value="treasurer">Treasurer</option>
                          <option value="auditor">Auditor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </FieldInput>
                      <FieldInput label="Occupation">
                        <input value={form.occupation} onChange={e => setForm(f => ({ ...f, occupation: e.target.value }))}
                          placeholder="e.g. Teacher, Engineer" style={inputStyle} />
                      </FieldInput>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <FieldInput label="Physical Address">
                          <input value={form.physical_address} onChange={e => setForm(f => ({ ...f, physical_address: e.target.value }))}
                            placeholder="Estate / Town / County" style={inputStyle} />
                        </FieldInput>
                      </div>
                    </div>
                  </div>

                  {/* Section: Next of Kin — SASRA required */}
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, height: 1, background: '#F3F4F6' }} /> Next of Kin (SASRA Required) <span style={{ flex: 1, height: 1, background: '#F3F4F6' }} />
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <FieldInput label="NOK Full Name">
                        <input value={form.nok_name} onChange={e => setForm(f => ({ ...f, nok_name: e.target.value }))}
                          placeholder="Full name" style={inputStyle} />
                      </FieldInput>
                      <FieldInput label="Relationship">
                        <select value={form.nok_relationship} onChange={e => setForm(f => ({ ...f, nok_relationship: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="">Select</option>
                          {NOK_RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </FieldInput>
                      <FieldInput label="NOK Phone">
                        <input value={form.nok_phone} onChange={e => setForm(f => ({ ...f, nok_phone: e.target.value }))}
                          placeholder="+254700000000" style={inputStyle} />
                      </FieldInput>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 24px 20px', borderTop: '1px solid #F3F4F6', display: 'flex', gap: 10 }}>
                  <button type="button" onClick={closeModal} style={{
                    flex: 1, background: '#F3F4F6', color: '#374151', border: 'none',
                    borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>Cancel</button>
                  <button type="submit" disabled={saving} style={{
                    flex: 2, background: saving ? '#93C5FD' : '#1D4ED8', color: '#fff', border: 'none',
                    borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                  }}>
                    {saving ? 'Enrolling…' : 'Enrol Member'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
