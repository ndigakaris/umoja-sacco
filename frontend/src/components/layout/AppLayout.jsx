/**
 * AppLayout — persistent sidebar + topbar shell
 * Updated (002): Added Project Shares and Import nav items
 */

import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getInitials } from '../../utils/formatters';

const navItems = [
  { section: 'Main', items: [
    { to: '/dashboard',      label: 'Dashboard',       icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z', roles: null },
    { to: '/members',        label: 'Members',         icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', roles: ['admin','treasurer','auditor'] },
    { to: '/loans',          label: 'Loans',            icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', roles: null },
    { to: '/savings',        label: 'Savings & Shares', icon: 'M2 5h20v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5zm0 5h20', roles: ['admin','treasurer','auditor'] },
    { to: '/project-shares', label: 'Project Shares',   icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zM9 22V12h6v10', roles: ['admin','treasurer','auditor'] },
    { to: '/welfare',        label: 'Welfare',           icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z', roles: null },
    { to: '/penalties',      label: 'Penalties',         icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01', roles: null },
  ]},
  { section: 'Finance', items: [
    { to: '/transactions', label: 'Transactions', icon: 'M23 4l-6 6M1 20l6-6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15', roles: null },
    { to: '/reports',      label: 'Reports',       icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-2 11H8m4-4H8m8 8h-8', roles: ['admin','treasurer','auditor'] },
    { to: '/audit',        label: 'Audit Logs',    icon: 'M21 21l-4.35-4.35m0 0A7 7 0 1 0 2.65 8.65a7 7 0 0 0 14 8', roles: ['admin','auditor'] },
  ]},
  { section: 'Tools', items: [
    { to: '/import',   label: 'Import Records', icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12', roles: ['admin','treasurer'] },
    { to: '/settings', label: 'Settings',        icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8.94-5a8.94 8.94 0 0 0-.16-1.36l2.17-1.69-2-3.46-2.54.92a8.9 8.9 0 0 0-2.36-1.36L15.5 1h-4l-.55 2.05a8.9 8.9 0 0 0-2.36 1.36L6.05 3.5l-2 3.46 2.17 1.69A8.94 8.94 0 0 0 6.06 10c0 .46.04.92.16 1.36L4.05 13.05l2 3.46 2.54-.92a8.9 8.9 0 0 0 2.36 1.36L11.5 19h4l.55-2.05a8.9 8.9 0 0 0 2.36-1.36l2.54.92 2-3.46-2.17-1.69A8.94 8.94 0 0 0 20.94 10z', roles: ['admin'] },
  ]},
];

export default function AppLayout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const Sidebar = () => (
    <aside style={{ width: 220, background: '#1E3A5F', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto', height: '100%' }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: '#fff', letterSpacing: '-0.02em' }}>
          Umoja<span style={{ color: '#5BC4A0' }}>SACCO</span>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>SASRA Compliant · Kenya</div>
      </div>

      {/* User pill */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#5BC4A0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          {getInitials(user?.full_name)}
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff' }}>{user?.full_name}</div>
          <div style={{ fontSize: 10, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', padding: '1px 6px', borderRadius: 20, display: 'inline-block', marginTop: 2, textTransform: 'capitalize' }}>{user?.role}</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: '8px 8px' }}>
        {navItems.map(({ section, items }) => {
          const visible = items.filter(i => !i.roles || hasRole(...i.roles));
          if (!visible.length) return null;
          return (
            <div key={section} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', padding: '6px 10px 4px' }}>{section}</div>
              {visible.map(item => (
                <NavLink key={item.to} to={item.to}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                    fontSize: 13, textDecoration: 'none', transition: 'all 0.1s',
                    background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                    fontWeight: isActive ? 600 : 400,
                  })}>
                  <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0.85 }}>
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>

      {/* Bottom */}
      <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <NavLink to="/notifications"
          style={({ isActive }) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: isActive ? '#fff' : 'rgba(255,255,255,0.6)', background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent', marginBottom: 2 })}>
          <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9m-4.27 13a2 2 0 0 1-3.46 0" />
          </svg>
          Notifications
        </NavLink>
        <button onClick={handleLogout}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <svg width={15} height={15} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8FAFC', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <header style={{ height: 56, background: '#fff', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', padding: '0 24px', flexShrink: 0, justifyContent: 'flex-end', gap: 16 }}>
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>
            {new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </header>

        {/* Page */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
