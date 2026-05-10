/**
 * AppLayout — persistent sidebar + topbar shell
 * All authenticated pages render inside <Outlet />
 */

import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getInitials } from '../../utils/formatters';

const navItems = [
  { section: 'Main', items: [
    { to: '/dashboard', label: 'Dashboard', icon: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z', roles: null },
    { to: '/members', label: 'Members', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75', roles: ['admin','treasurer','auditor'] },
    { to: '/loans', label: 'Loans', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', roles: null },
    { to: '/savings', label: 'Savings & Shares', icon: 'M2 5h20v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5zm0 5h20', roles: ['admin','treasurer','auditor'] },
    { to: '/welfare', label: 'Welfare', icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z', roles: null },
    { to: '/penalties', label: 'Penalties', icon: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4m0 4h.01', roles: null },
  ]},
  { section: 'Finance', items: [
    { to: '/transactions', label: 'Transactions', icon: 'M23 4l-6 6M1 20l6-6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15', roles: null },
    { to: '/reports', label: 'Reports', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-2 11H8m4-4H8m8 8h-8', roles: ['admin','treasurer','auditor'] },
    { to: '/audit', label: 'Audit Logs', icon: 'M21 21l-4.35-4.35m0 0A7 7 0 1 0 2.65 8.65a7 7 0 0 0 14 8', roles: ['admin','auditor'] },
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

  const SvgIcon = ({ d, size = 16 }) => (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      {d.split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={'M' + seg} />
      ))}
    </svg>
  );

  const Sidebar = () => (
    <aside className="w-[220px] bg-primary-600 flex flex-col flex-shrink-0 overflow-y-auto h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="font-display font-semibold text-[18px] text-white tracking-tight">
          Umoja<span className="text-[#5BC4A0]">SACCO</span>
        </div>
        <div className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">SASRA Compliant · Kenya</div>
      </div>

      {/* User pill */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-[#5BC4A0] flex items-center justify-center text-xs font-semibold text-white flex-shrink-0">
          {getInitials(user?.full_name)}
        </div>
        <div>
          <div className="text-[12.5px] font-medium text-white leading-tight">{user?.full_name}</div>
          <div className="text-[10px] bg-white/15 text-white/80 px-1.5 py-0.5 rounded-full inline-block mt-0.5 capitalize">{user?.role}</div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 py-2">
        {navItems.map(({ section, items }) => {
          const visible = items.filter(i => !i.roles || hasRole(...i.roles));
          if (!visible.length) return null;
          return (
            <div key={section} className="px-2 py-1">
              <div className="text-[9.5px] uppercase tracking-widest text-white/30 px-2 py-1.5">{section}</div>
              {visible.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] mb-0.5 transition-all ${
                      isActive ? 'bg-white/15 text-white font-medium' : 'text-white/60 hover:bg-white/8 hover:text-white'
                    }`
                  }
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" className="flex-shrink-0 opacity-85">
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>

      {/* Bottom links */}
      <div className="p-2 border-t border-white/10">
        <NavLink to="/notifications" className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-white/60 hover:bg-white/8 hover:text-white transition-all">
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9m-4.27 13a2 2 0 0 1-3.46 0"/></svg>
          Notifications
        </NavLink>
        {hasRole('admin') && (
          <NavLink to="/settings" className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-white/60 hover:bg-white/8 hover:text-white transition-all">
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Settings
          </NavLink>
        )}
        <button onClick={handleLogout} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-white/50 hover:bg-red-500/20 hover:text-red-300 transition-all">
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/></svg>
          Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col h-full">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex flex-col h-full">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 h-14 flex items-center px-4 md:px-6 flex-shrink-0">
          <button className="md:hidden mr-3 p-1.5 rounded-lg hover:bg-gray-100" onClick={() => setSidebarOpen(true)}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="font-display font-semibold text-[15px] text-gray-900 flex-1">
            UmojaSACCO
          </div>
          <div className="flex items-center gap-2">
            <NavLink to="/notifications" className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center relative">
              <svg width="16" height="16" fill="none" stroke="#4A6078" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9m-4.27 13a2 2 0 0 1-3.46 0"/></svg>
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
            </NavLink>
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-xs font-semibold text-white">
              {getInitials(user?.full_name)}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
