/**
 * Settings Page — SACCO configuration (Admin only)
 */
import React, { useState, useEffect } from 'react';
import api from '../utils/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/settings').then(r => {
      const s = {};
      (r.data.data || []).forEach(({ key, value }) => { s[key] = value; });
      setSettings(s);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleChange = e => setSettings(s => ({ ...s, [e.target.name]: e.target.value }));

  const handleSave = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', { settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    finally { setSaving(false); }
  };

  const fields = [
    { section: 'SACCO Information', items: [
      { key: 'sacco_name', label: 'SACCO Name', placeholder: 'Umoja SACCO Society Ltd' },
      { key: 'sacco_reg_no', label: 'Registration No.', placeholder: 'CS/SACCO/2010/001234' },
      { key: 'sacco_sasra_no', label: 'SASRA No.', placeholder: 'SASRA/DT/2010/0089' },
    ]},
    { section: 'Financial Settings', items: [
      { key: 'monthly_contribution', label: 'Monthly Contribution (KES)', placeholder: '5000', type: 'number' },
      { key: 'min_shares', label: 'Minimum Shares (KES)', placeholder: '1000', type: 'number' },
      { key: 'max_loan_multiplier', label: 'Max Loan Multiplier (x savings)', placeholder: '4', type: 'number' },
      { key: 'welfare_monthly_deduction', label: 'Welfare Monthly Deduction (KES)', placeholder: '500', type: 'number' },
    ]},
    { section: 'Calendar', items: [
      { key: 'financial_year_end', label: 'Financial Year End Month', placeholder: 'December' },
    ]},
  ];

  if (loading) return (
    <div className="space-y-6">
      {Array(3).fill(0).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-40 mb-4"/>
          {Array(3).fill(0).map((_, j) => <div key={j} className="h-10 bg-gray-100 rounded mb-3"/>)}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display font-semibold text-xl text-gray-900">Settings</h1>
        <p className="text-sm text-gray-400 mt-0.5">SACCO system configuration</p>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          ✓ Settings saved successfully
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {fields.map(section => (
          <div key={section.section} className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium text-gray-700 mb-4 pb-2 border-b border-gray-100">{section.section}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.items.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                  <input name={f.key} type={f.type || 'text'} value={settings[f.key] || ''} onChange={handleChange} placeholder={f.placeholder}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600" />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex justify-end">
          <button type="submit" disabled={saving}
            className="h-10 px-6 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg disabled:opacity-60 transition-colors">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
