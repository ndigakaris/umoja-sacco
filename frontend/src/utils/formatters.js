/**
 * Formatting utilities used across the frontend
 */

/**
 * Format a number as Kenyan Shillings
 * @param {number} amount
 * @param {boolean} showCurrency - include "KES" prefix
 */
export function formatCurrency(amount, showCurrency = true) {
  const num = parseFloat(amount) || 0;
  const formatted = new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
  return showCurrency ? `KES ${formatted}` : formatted;
}

/**
 * Format a date string to readable format
 * @param {string|Date} date
 * @param {string} style - 'short' | 'long' | 'datetime'
 */
export function formatDate(date, style = 'short') {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';

  if (style === 'long') return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' });
  if (style === 'datetime') return d.toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Format a loan status into display label + color class
 */
export function loanStatusBadge(status) {
  const map = {
    draft: { label: 'Draft', cls: 'badge-gray' },
    pending: { label: 'Pending', cls: 'badge-amber' },
    under_review: { label: 'Under Review', cls: 'badge-blue' },
    approved: { label: 'Approved', cls: 'badge-green' },
    rejected: { label: 'Rejected', cls: 'badge-red' },
    active: { label: 'Active', cls: 'badge-green' },
    completed: { label: 'Completed', cls: 'badge-gray' },
    defaulted: { label: 'Defaulted', cls: 'badge-red' },
  };
  return map[status] || { label: status, cls: 'badge-gray' };
}

/**
 * Truncate long strings
 */
export function truncate(str, maxLen = 40) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

/**
 * Get initials from a full name
 */
export function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}
