/**
 * MemberProfilePage.jsx — Full SASRA KYC Member Profile
 *
 * Was: a blank stub with "Implement UI components here."
 * Now:
 *  - Fetches full member data from GET /api/members/:id
 *  - Shows KYC status timeline with verification details
 *  - Account balances (savings, shares, welfare, loans)
 *  - Recent statement (last 10 transactions)
 *  - Edit profile inline (PATCH /api/members/:id)
 *  - KYC approve / reject (PATCH /api/members/:id/kyc)
 *  - Back navigation, breadcrumb
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { formatCurrency, formatDate, getInitials } from '../utils/formatters';

/* ─── helpers ────────────────────────────────────────────────────────── */
const KYC_STEPS = [
  { key: 'registered',  label: 'Registered',      icon: '👤' },
  { key: 'docs',        label: 'Docs Submitted',   icon: '📄' },
  { key: 'under_review',label: 'Under Review',     icon: '🔍' },
  { key: 'verified',    label: 'Verified',          icon: '✅' },
];

const KYC_COLOR = {
  pending:  { bg: '#FFFBEB', border: '#FCD34D', text: '#92400E' },
  verified: { bg: '#ECFDF5', border: '#6EE7B7', text: '#065F46' },
  rejected: { bg: '#FEF2F2', border: '#FCA5A5', text: '#991B1B' },
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: '1.5px solid #E5E7EB', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, color: '#111827',
  outline: 'none', background: '#FAFAFA', fontFamily: 'inherit',
};

const NOK_RELS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Guardian', 'Friend', 'Other'];

const Field = ({ label, value }) => (
  <div style={{ marginBottom: 14 }}>
    <dt style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</dt>
    <dd style={{ fontSize: 13, color: '#111827', margin: 0, fontWeight: 500 }}>{value || <span style={{ color: '#D1D5DB' }}>—</span>}</dd>
  </div>
);

const SectionCard = ({ title, children, action }) => (
  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
    <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', letterSpacing: '0.01em' }}>{title}</span>
      {action}
    </div>
    <div style={{ padding: '16px 20px' }}>{children}</div>
  </div>
);

const AccountCard = ({ label, amount, accent }) => (
  <div style={{ background: accent + '12', border: `1px solid ${accent}30`, borderRadius: 12, padding: '14px 16px' }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{formatCurrency(amount)}</div>
  </div>
);

/* ─── Main ───────────────────────────────────────────────────────────── */
export default function MemberProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  const [member, setMember]     = useState(null);
  const [statement, setStmt]    = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving]     = useState(false);
  const [kycBusy, setKycBusy]   = useState(false);
  const [toast, setToast]       = useState(null);
  const [error, setError]       = useState('');

  const isAdmin = authUser?.role === 'admin' || authUser?.role === 'treasurer';

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  /* fetch member + statement */
  const fetchMember = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: mData }, { data: sData }] = await Promise.all([
        api.get(`/members/${id}`),
        api.get(`/members/${id}/statement`, { params: { limit: 10 } }),
      ]);
      setMember(mData.data);
      setEditForm({
        full_name: mData.data.full_name, phone: mData.data.phone || '',
        id_number: mData.data.id_number || '', occupation: mData.data.occupation || '',
        employer: mData.data.employer || '', physical_address: mData.data.physical_address || '',
        date_of_birth: mData.data.date_of_birth ? mData.data.date_of_birth.slice(0, 10) : '',
        gender: mData.data.gender || '',
        nok_name: mData.data.nok_name || '', nok_relationship: mData.data.nok_relationship || '',
        nok_phone: mData.data.nok_phone || '', nok_id_number: mData.data.nok_id_number || '',
        status: mData.data.status,
      });
      setStmt(sData.data || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load member');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchMember(); }, [fetchMember]);

  /* save edits */
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/members/${id}`, editForm);
      showToast('success', 'Profile updated successfully');
      setEditing(false);
      fetchMember();
    } catch (e) {
      showToast('error', e.response?.data?.message || 'Update failed');
    }
    setSaving(false);
  };

  /* KYC actions */
  const handleKyc = async (kyc_status) => {
    setKycBusy(true);
    try {
      await api.patch(`/members/${id}/kyc`, { kyc_status });
      showToast('success', `KYC status updated to ${kyc_status}`);
      fetchMember();
    } catch {
      showToast('error', 'KYC update failed');
    }
    setKycBusy(false);
  };

  /* ─── Loading / error states ──────────────────────────────────────── */
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #E5E7EB', borderTopColor: '#1D4ED8', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#9CA3AF', fontSize: 13 }}>Loading member profile…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (error || !member) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: '#EF4444', fontSize: 14 }}>{error || 'Member not found'}</p>
      <button onClick={() => navigate('/members')} style={{ marginTop: 16, background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 13 }}>
        ← Back to Members
      </button>
    </div>
  );

  const kycC = KYC_COLOR[member.kyc_status] || KYC_COLOR.pending;
  const kycStep = member.kyc_status === 'verified' ? 3 : member.kyc_status === 'rejected' ? 2 : 1;

  /* ─── Render ──────────────────────────────────────────────────────── */
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', fontFamily: 'inherit' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 999,
          background: toast.type === 'success' ? '#ECFDF5' : '#FEF2F2',
          color: toast.type === 'success' ? '#065F46' : '#991B1B',
          border: `1px solid ${toast.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
          borderRadius: 12, padding: '12px 18px', fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb + back */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: '#9CA3AF' }}>
        <button onClick={() => navigate('/members')} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 13, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          ← Members
        </button>
        <span>/</span>
        <span style={{ color: '#374151', fontWeight: 500 }}>{member.full_name}</span>
      </div>

      {/* Profile hero */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '24px 28px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
          background: `hsl(${member.full_name?.charCodeAt(0) * 47 % 360},55%,88%)`,
          color: `hsl(${member.full_name?.charCodeAt(0) * 47 % 360},55%,30%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 700,
        }}>
          {getInitials(member.full_name)}
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#111827' }}>{member.full_name}</h1>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', padding: '3px 10px', borderRadius: 20 }}>{member.member_no}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', background: '#E5E7EB', padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{member.role}</span>
          </div>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 12px' }}>{member.email} · {member.phone || 'No phone'}</p>

          {/* KYC status chip */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: kycC.bg, border: `1px solid ${kycC.border}`,
            borderRadius: 10, padding: '6px 14px',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: kycC.text, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              KYC: {member.kyc_status || 'PENDING'}
            </span>
            {member.kyc_verified_at && (
              <span style={{ fontSize: 11, color: kycC.text, opacity: 0.7 }}>
                · Verified {formatDate(member.kyc_verified_at)}
              </span>
            )}
          </div>
        </div>

        {/* Admin KYC actions */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            {member.kyc_status !== 'verified' && (
              <button disabled={kycBusy} onClick={() => handleKyc('verified')} style={{
                background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0',
                borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                ✓ Approve KYC
              </button>
            )}
            {member.kyc_status !== 'rejected' && (
              <button disabled={kycBusy} onClick={() => handleKyc('rejected')} style={{
                background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA',
                borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                ✕ Reject KYC
              </button>
            )}
            <button onClick={() => setEditing(!editing)} style={{
              background: editing ? '#EFF6FF' : '#F3F4F6', color: editing ? '#1D4ED8' : '#374151',
              border: `1px solid ${editing ? '#BFDBFE' : '#E5E7EB'}`,
              borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {editing ? '✕ Cancel Edit' : '✎ Edit Profile'}
            </button>
          </div>
        )}
      </div>

      {/* KYC Progress Timeline */}
      <SectionCard title="KYC Verification Progress">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          {KYC_STEPS.map((step, i) => {
            const done = i <= kycStep;
            const isLast = i === KYC_STEPS.length - 1;
            return (
              <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  {i > 0 && <div style={{ flex: 1, height: 2, background: done ? '#1D4ED8' : '#E5E7EB', transition: 'background 0.3s' }} />}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: done ? '#1D4ED8' : '#F3F4F6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, border: `2px solid ${done ? '#1D4ED8' : '#E5E7EB'}`,
                    transition: 'all 0.3s',
                  }}>
                    {done ? <span style={{ fontSize: 14 }}>✓</span> : <span style={{ fontSize: 14, opacity: 0.3 }}>{step.icon}</span>}
                  </div>
                  {!isLast && <div style={{ flex: 1, height: 2, background: i < kycStep ? '#1D4ED8' : '#E5E7EB', transition: 'background 0.3s' }} />}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: done ? '#1D4ED8' : '#9CA3AF', marginTop: 6, textAlign: 'center', letterSpacing: '0.03em' }}>{step.label}</span>
              </div>
            );
          })}
        </div>
        {member.kyc_status === 'rejected' && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 12, color: '#991B1B' }}>
            ⚠ KYC rejected. Member must resubmit documents for reverification.
          </div>
        )}
      </SectionCard>

      {/* Account Balances */}
      <SectionCard title="Account Balances">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <AccountCard label="Savings" amount={member.savings_balance} accent="#1D4ED8" />
          <AccountCard label="Shares" amount={member.shares_balance} accent="#065F46" />
          <AccountCard label="Welfare" amount={member.welfare_balance} accent="#7C3AED" />
          <AccountCard label="Active Loans" amount={member.loan_balance} accent={parseFloat(member.loan_balance) > 0 ? '#DC2626' : '#6B7280'} />
        </div>
        {member.pending_penalties > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 14px', marginTop: 12, fontSize: 12, color: '#92400E', fontWeight: 600 }}>
            ⚠ {member.pending_penalties} pending penalt{member.pending_penalties > 1 ? 'ies' : 'y'}
          </div>
        )}
      </SectionCard>

      {/* Personal Information — view or edit */}
      <SectionCard
        title={editing ? 'Edit Profile' : 'Personal Information'}
        action={editing && (
          <button onClick={handleSave} disabled={saving} style={{
            background: '#1D4ED8', color: '#fff', border: 'none',
            borderRadius: 8, padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        )}
      >
        {editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { key: 'full_name', label: 'Full Name', required: true },
              { key: 'phone', label: 'Phone' },
              { key: 'id_number', label: 'National ID' },
              { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
              { key: 'occupation', label: 'Occupation' },
              { key: 'employer', label: 'Employer' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
                  {f.label}{f.required && <span style={{ color: '#EF4444' }}>*</span>}
                </label>
                <input
                  type={f.type || 'text'}
                  value={editForm[f.key] || ''}
                  onChange={e => setEditForm(v => ({ ...v, [f.key]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Gender</label>
              <select value={editForm.gender || ''} onChange={e => setEditForm(v => ({ ...v, gender: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Status</label>
              <select value={editForm.status || ''} onChange={e => setEditForm(v => ({ ...v, status: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Physical Address</label>
              <input value={editForm.physical_address || ''} onChange={e => setEditForm(v => ({ ...v, physical_address: e.target.value }))} style={inputStyle} />
            </div>
            {/* NOK */}
            <div style={{ gridColumn: '1 / -1', paddingTop: 8, borderTop: '1px solid #F3F4F6', marginTop: 4 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>Next of Kin</p>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>NOK Name</label>
              <input value={editForm.nok_name || ''} onChange={e => setEditForm(v => ({ ...v, nok_name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Relationship</label>
              <select value={editForm.nok_relationship || ''} onChange={e => setEditForm(v => ({ ...v, nok_relationship: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Select</option>
                {NOK_RELS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>NOK Phone</label>
              <input value={editForm.nok_phone || ''} onChange={e => setEditForm(v => ({ ...v, nok_phone: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>NOK ID Number</label>
              <input value={editForm.nok_id_number || ''} onChange={e => setEditForm(v => ({ ...v, nok_id_number: e.target.value }))} style={inputStyle} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 0 }}>
            <Field label="Email" value={member.email} />
            <Field label="Phone" value={member.phone} />
            <Field label="National ID" value={member.id_number} />
            <Field label="Date of Birth" value={member.date_of_birth ? formatDate(member.date_of_birth, 'long') : null} />
            <Field label="Gender" value={member.gender} />
            <Field label="Occupation" value={member.occupation} />
            <Field label="Employer" value={member.employer} />
            <Field label="Physical Address" value={member.physical_address} />
            <Field label="Member Since" value={formatDate(member.created_at, 'long')} />
            <Field label="Last Login" value={member.last_login ? formatDate(member.last_login, 'datetime') : 'Never'} />
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #F3F4F6', paddingTop: 14, marginTop: 6 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 12px' }}>Next of Kin</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
                <Field label="NOK Name" value={member.nok_name} />
                <Field label="Relationship" value={member.nok_relationship} />
                <Field label="NOK Phone" value={member.nok_phone} />
                <Field label="NOK ID Number" value={member.nok_id_number} />
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Recent Statement */}
      <SectionCard title={`Recent Transactions (last ${statement.length})`}>
        {statement.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No transactions yet</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                  {['Date', 'Description', 'Account', 'Debit', 'Credit', 'Balance'].map(h => (
                    <th key={h} style={{
                      padding: '6px 10px', textAlign: ['Debit', 'Credit', 'Balance'].includes(h) ? 'right' : 'left',
                      fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statement.map((tx, i) => (
                  <tr key={tx.id} style={{ borderBottom: i < statement.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
                    <td style={{ padding: '8px 10px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>{formatDate(tx.transaction_date)}</td>
                    <td style={{ padding: '8px 10px', color: '#374151', maxWidth: 200 }}>{tx.description}</td>
                    <td style={{ padding: '8px 10px', color: '#6B7280', textTransform: 'capitalize' }}>{tx.account_type}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#DC2626', fontFamily: 'monospace' }}>
                      {parseFloat(tx.debit) > 0 ? formatCurrency(tx.debit) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#065F46', fontFamily: 'monospace' }}>
                      {parseFloat(tx.credit) > 0 ? formatCurrency(tx.credit) : '—'}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#111827', fontWeight: 600 }}>
                      {tx.balance_after != null ? formatCurrency(tx.balance_after) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
