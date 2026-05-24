/**
 * ProjectSharesPage.jsx — SACCO Project Share Management
 *
 * Allows admin/treasurer to:
 *  - Create projects (e.g. "Purchase of Land", "Purchase of Tents")
 *  - View which members have shares in each project
 *  - Assign/update share allocations per member
 *  - Remove a member from a project
 *  - See project summary stats (total raised, member count, unit count)
 */

import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { formatCurrency, formatDate } from '../utils/formatters';

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: '1.5px solid #E5E7EB', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: '#111827',
  outline: 'none', background: '#FAFAFA', fontFamily: 'inherit',
};

const btn = (color = '#1D4ED8') => ({
  background: color, color: '#fff', border: 'none', borderRadius: 8,
  padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
});

const Card = ({ children, style = {} }) => (
  <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', ...style }}>
    {children}
  </div>
);

const StatPill = ({ label, value, color = '#1D4ED8' }) => (
  <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 16px', textAlign: 'center', border: '1px solid #E5E7EB' }}>
    <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{label}</div>
  </div>
);

export default function ProjectSharesPage() {
  const [projects, setProjects]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [selectedProject, setSelected]    = useState(null);
  const [projectMembers, setProjMembers]  = useState([]);
  const [nonMembers, setNonMembers]       = useState([]);
  const [membersLoading, setMemLoading]   = useState(false);
  const [showNewProject, setShowNew]      = useState(false);
  const [showAllocForm, setShowAlloc]     = useState(false);
  const [toast, setToast]                 = useState(null);
  const [search, setSearch]               = useState('');

  // New project form
  const [projForm, setProjForm] = useState({ name: '', description: '', total_value: '', share_price: '' });
  // Allocation form
  const [allocForm, setAllocForm] = useState({ user_id: '', units: '', amount_paid: '', notes: '', alloc_date: '' });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/projects?active_only=false');
      setProjects(data.data);
    } catch {
      setToast({ type: 'error', msg: 'Failed to load projects' });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const fetchProjectMembers = useCallback(async (projectId) => {
    setMemLoading(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/members?search=${search}&limit=200`);
      setProjMembers(data.data);
      setNonMembers(data.non_members || []);
    } catch {
      setToast({ type: 'error', msg: 'Failed to load project members' });
    }
    setMemLoading(false);
  }, [search]);

  useEffect(() => {
    if (selectedProject) fetchProjectMembers(selectedProject.id);
  }, [selectedProject, fetchProjectMembers]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!projForm.name?.trim()) return setToast({ type: 'error', msg: 'Project name is required' });
    try {
      await api.post('/projects', {
        name: projForm.name,
        description: projForm.description,
        total_value: parseFloat(projForm.total_value) || 0,
        share_price: parseFloat(projForm.share_price) || 1,
      });
      setToast({ type: 'success', msg: 'Project created!' });
      setShowNew(false);
      setProjForm({ name: '', description: '', total_value: '', share_price: '' });
      fetchProjects();
    } catch (err) {
      setToast({ type: 'error', msg: err.response?.data?.message || 'Failed to create project' });
    }
  };

  const handleAllocate = async (e) => {
    e.preventDefault();
    if (!allocForm.user_id) return setToast({ type: 'error', msg: 'Select a member' });
    if (!allocForm.units || parseFloat(allocForm.units) < 0) return setToast({ type: 'error', msg: 'Enter valid units' });
    try {
      await api.post(`/projects/${selectedProject.id}/allocate`, {
        user_id: allocForm.user_id,
        units: parseFloat(allocForm.units),
        amount_paid: parseFloat(allocForm.amount_paid || 0),
        notes: allocForm.notes,
        alloc_date: allocForm.alloc_date || undefined,
      });
      setToast({ type: 'success', msg: 'Allocation saved!' });
      setShowAlloc(false);
      setAllocForm({ user_id: '', units: '', amount_paid: '', notes: '', alloc_date: '' });
      fetchProjectMembers(selectedProject.id);
      fetchProjects();
    } catch (err) {
      setToast({ type: 'error', msg: err.response?.data?.message || 'Failed to save allocation' });
    }
  };

  const handleRemoveMember = async (userId, memberName) => {
    if (!window.confirm(`Remove ${memberName} from "${selectedProject.name}"?`)) return;
    try {
      await api.delete(`/projects/${selectedProject.id}/allocate/${userId}`);
      setToast({ type: 'success', msg: 'Member removed from project' });
      fetchProjectMembers(selectedProject.id);
      fetchProjects();
    } catch {
      setToast({ type: 'error', msg: 'Failed to remove member' });
    }
  };

  const toggleActive = async (project) => {
    try {
      await api.patch(`/projects/${project.id}`, { is_active: !project.is_active });
      fetchProjects();
    } catch {
      setToast({ type: 'error', msg: 'Failed to update project' });
    }
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1300, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: toast.type === 'error' ? '#FEF2F2' : '#ECFDF5', border: `1px solid ${toast.type === 'error' ? '#FCA5A5' : '#6EE7B7'}`, color: toast.type === 'error' ? '#991B1B' : '#065F46', borderRadius: 10, padding: '12px 18px', fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
          {toast.type === 'success' ? '✓' : '⚠'} {toast.msg}
          <button onClick={() => setToast(null)} style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Project Shares</h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>Manage SACCO investment projects and member share allocations</p>
        </div>
        <button onClick={() => setShowNew(true)} style={btn()}>+ New Project</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedProject ? '340px 1fr' : '1fr', gap: 20 }}>

        {/* Projects List */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {projects.length} Projects
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#9CA3AF', padding: 40 }}>Loading…</div>
          ) : projects.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
              <div style={{ color: '#9CA3AF', fontSize: 14 }}>No projects yet. Create your first project.</div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projects.map(p => (
                <div key={p.id}
                  onClick={() => { setSelected(p); setShowAlloc(false); }}
                  style={{
                    background: selectedProject?.id === p.id ? '#EFF6FF' : '#fff',
                    border: `1.5px solid ${selectedProject?.id === p.id ? '#3B82F6' : '#E5E7EB'}`,
                    borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{p.name}</div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: p.is_active ? '#ECFDF5' : '#F3F4F6', color: p.is_active ? '#065F46' : '#6B7280' }}>
                      {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  {p.description && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>{p.description}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>Members<br /><strong style={{ color: '#111827' }}>{p.member_count}</strong></div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>Units Sold<br /><strong style={{ color: '#111827' }}>{parseFloat(p.total_units_allocated || 0).toLocaleString()}</strong></div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>Raised<br /><strong style={{ color: '#065F46', fontSize: 12 }}>{formatCurrency(p.total_raised)}</strong></div>
                  </div>
                  {p.total_value > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9CA3AF', marginBottom: 3 }}>
                        <span>Progress</span>
                        <span>{Math.min(100, ((p.total_raised / p.total_value) * 100)).toFixed(1)}%</span>
                      </div>
                      <div style={{ height: 5, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, (p.total_raised / p.total_value) * 100)}%`, background: '#10B981', borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Project Detail */}
        {selectedProject && (
          <div>
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{selectedProject.name}</h2>
                  {selectedProject.description && <p style={{ margin: 0, color: '#6B7280', fontSize: 13 }}>{selectedProject.description}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => toggleActive(selectedProject)}
                    style={{ ...btn(selectedProject.is_active ? '#6B7280' : '#10B981'), fontSize: 12, padding: '7px 12px' }}>
                    {selectedProject.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => setShowAlloc(true)} style={btn('#1D4ED8')}>+ Add Member</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <StatPill label="Members" value={projectMembers.length} color="#1D4ED8" />
                <StatPill label="Total Units" value={projectMembers.reduce((s, m) => s + parseFloat(m.units || 0), 0).toLocaleString()} color="#7C3AED" />
                <StatPill label="Amount Paid" value={formatCurrency(projectMembers.reduce((s, m) => s + parseFloat(m.amount_paid || 0), 0))} color="#065F46" />
                <StatPill label="Share Price" value={formatCurrency(selectedProject.share_price)} color="#92400E" />
              </div>
            </Card>

            {/* Add Allocation Form */}
            {showAllocForm && (
              <Card style={{ marginBottom: 16, border: '1.5px solid #3B82F6', background: '#F0F9FF' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Add / Update Member Allocation</h3>
                <form onSubmit={handleAllocate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5 }}>MEMBER *</label>
                    <select style={inputStyle} value={allocForm.user_id} onChange={e => setAllocForm(f => ({ ...f, user_id: e.target.value }))}>
                      <option value="">Select member…</option>
                      {nonMembers.map(m => (
                        <option key={m.id} value={m.id}>{m.full_name} — {m.member_no}</option>
                      ))}
                      {projectMembers.map(m => (
                        <option key={m.id} value={m.id}>✎ Update: {m.full_name} — {m.member_no}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5 }}>UNITS *</label>
                    <input type="number" min="0" step="0.5" style={inputStyle} placeholder="e.g. 2" value={allocForm.units} onChange={e => setAllocForm(f => ({ ...f, units: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5 }}>AMOUNT PAID (KES)</label>
                    <input type="number" min="0" step="0.01" style={inputStyle} placeholder="e.g. 10000" value={allocForm.amount_paid} onChange={e => setAllocForm(f => ({ ...f, amount_paid: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5 }}>DATE</label>
                    <input type="date" style={inputStyle} value={allocForm.alloc_date} onChange={e => setAllocForm(f => ({ ...f, alloc_date: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5 }}>NOTES</label>
                    <input style={inputStyle} placeholder="Optional note…" value={allocForm.notes} onChange={e => setAllocForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setShowAlloc(false)} style={{ ...btn('#F3F4F6'), color: '#374151', flex: 1 }}>Cancel</button>
                    <button type="submit" style={{ ...btn(), flex: 2 }}>Save Allocation</button>
                  </div>
                </form>
              </Card>
            )}

            {/* Search */}
            <div style={{ marginBottom: 12 }}>
              <input style={inputStyle} placeholder="Search members in this project…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Members Table */}
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {membersLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading members…</div>
              ) : projectMembers.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
                  No members allocated to this project yet.
                  <br />
                  <button onClick={() => setShowAlloc(true)} style={{ marginTop: 12, ...btn(), fontSize: 13 }}>Add First Member</button>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                      {['Member', 'Member No.', 'Units', 'Amount Paid', 'Total Value', 'Date', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {projectMembers.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '11px 14px', fontWeight: 600, color: '#111827' }}>{m.full_name}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <code style={{ background: '#F3F4F6', padding: '2px 7px', borderRadius: 5, fontSize: 12 }}>{m.member_no}</code>
                        </td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: '#7C3AED' }}>{parseFloat(m.units).toLocaleString()}</td>
                        <td style={{ padding: '11px 14px', color: '#065F46', fontWeight: 500 }}>{formatCurrency(m.amount_paid)}</td>
                        <td style={{ padding: '11px 14px', color: '#1D4ED8', fontWeight: 600 }}>{formatCurrency(m.total_value)}</td>
                        <td style={{ padding: '11px 14px', color: '#9CA3AF', fontSize: 12 }}>{formatDate(m.alloc_date)}</td>
                        <td style={{ padding: '11px 14px' }}>
                          <button
                            onClick={() => {
                              setAllocForm({ user_id: m.id, units: m.units, amount_paid: m.amount_paid, notes: m.notes || '', alloc_date: m.alloc_date || '' });
                              setShowAlloc(true);
                            }}
                            style={{ background: '#EFF6FF', color: '#1D4ED8', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 }}>
                            Edit
                          </button>
                          <button onClick={() => handleRemoveMember(m.id, m.full_name)}
                            style={{ background: '#FEF2F2', color: '#991B1B', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showNewProject && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '90%', maxWidth: 480, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Project</h2>
              <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6B7280' }}>×</button>
            </div>
            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Project Name *</label>
                <input style={inputStyle} placeholder="e.g. Purchase of Land" value={projForm.name} onChange={e => setProjForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Description</label>
                <input style={inputStyle} placeholder="Brief description of the project…" value={projForm.description} onChange={e => setProjForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Total Value (KES)</label>
                  <input type="number" min="0" style={inputStyle} placeholder="e.g. 5000000" value={projForm.total_value} onChange={e => setProjForm(f => ({ ...f, total_value: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Price per Share (KES)</label>
                  <input type="number" min="0" style={inputStyle} placeholder="e.g. 5000" value={projForm.share_price} onChange={e => setProjForm(f => ({ ...f, share_price: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" onClick={() => setShowNew(false)} style={{ ...btn('#F3F4F6'), color: '#374151', flex: 1 }}>Cancel</button>
                <button type="submit" style={{ ...btn(), flex: 2 }}>Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
