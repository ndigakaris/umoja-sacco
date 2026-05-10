/**
 * Notifications Page
 */
import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatDate } from '../utils/formatters';

const typeIcons = {
  loan_approved:   '✅',
  loan_rejected:   '❌',
  loan_disbursed:  '💰',
  payment_due:     '⏰',
  penalty_issued:  '⚠️',
  welfare_update:  '♡',
  system:          '🔔',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/notifications').then(r => setNotifications(r.data.data || [])).catch(() => setNotifications([])).finally(() => setLoading(false));
  }, []);

  const markRead = async id => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(n => n.map(x => x.id === id ? { ...x, is_read: true } : x));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(n => n.map(x => ({ ...x, is_read: true })));
    } catch {}
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-semibold text-xl text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-400 mt-0.5">{unread > 0 ? `${unread} unread` : 'All caught up'}</p>
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="h-8 px-3 text-xs text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50">Mark all read</button>
        )}
      </div>

      <div className="space-y-2">
        {loading ? Array(5).fill(0).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
            <div className="flex gap-3"><div className="w-8 h-8 bg-gray-100 rounded-full"/><div className="flex-1"><div className="h-3 bg-gray-100 rounded w-48 mb-2"/><div className="h-2 bg-gray-100 rounded w-full"/></div></div>
          </div>
        )) : notifications.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <div className="text-3xl mb-2">🔔</div>
            <div className="text-gray-400 text-sm">No notifications yet</div>
          </div>
        ) : notifications.map(n => (
          <div key={n.id} onClick={() => !n.is_read && markRead(n.id)}
            className={`bg-white border rounded-xl p-4 transition-colors cursor-pointer ${n.is_read ? 'border-gray-200' : 'border-primary-200 bg-primary-50/30'}`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-base flex-shrink-0">
                {typeIcons[n.type] || '🔔'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className={`text-[13px] font-medium ${n.is_read ? 'text-gray-700' : 'text-gray-900'}`}>{n.title}</div>
                  {!n.is_read && <div className="w-2 h-2 bg-primary-600 rounded-full flex-shrink-0" />}
                </div>
                <div className="text-[12px] text-gray-500 mt-0.5">{n.message}</div>
                <div className="text-[11px] text-gray-400 mt-1">{formatDate(n.created_at, 'datetime')}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
