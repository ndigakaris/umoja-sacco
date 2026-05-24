/**
 * ImportPage.jsx — Bulk Historical Records Import
 *
 * Import old/historical records for:
 *   - Savings deposits
 *   - Shares contributions
 *   - Welfare contributions
 *   - Combined contributions (savings + shares + welfare in one row)
 *   - Loans (old loan records)
 *   - Project shares allocations
 *
 * Workflow:
 *  1. Select import type
 *  2. Download CSV template
 *  3. Paste/upload CSV (parsed in browser)
 *  4. Preview first rows
 *  5. Submit → see success/error report
 *  6. View import history
 */

import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { formatDate } from '../utils/formatters';

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  border: '1.5px solid #E5E7EB', borderRadius: 8,
  padding: '9px 12px', fontSize: 13, color: '#111827',
  outline: 'none', background: '#FAFAFA', fontFamily: 'inherit',
};

const IMPORT_TYPES = [
  { value: 'contributions', label: 'Contributions (Savings + Shares + Welfare)', icon: '💰', desc: 'Import combined monthly contributions in one row per member' },
  { value: 'savings', label: 'Savings Deposits', icon: '🏦', desc: 'Import individual savings deposit records' },
  { value: 'shares', label: 'Shares Contributions', icon: '📈', desc: 'Import share purchase/contribution records' },
  { value: 'welfare', label: 'Welfare Contributions', icon: '❤️', desc: 'Import welfare fund contribution records' },
  { value: 'loans', label: 'Loan Records', icon: '📋', desc: 'Import historical loan data with outstanding balances' },
  { value: 'project_shares', label: 'Project Share Allocations', icon: '🏗️', desc: 'Import member allocations in SACCO projects (e.g. land purchase)' },
];

const TEMPLATES = {
  contributions:  ['member_no', 'savings_amount', 'shares_amount', 'welfare_amount', 'transaction_date', 'description'],
  savings:        ['member_no', 'amount', 'transaction_date', 'description'],
  shares:         ['member_no', 'amount', 'transaction_date', 'description'],
  welfare:        ['member_no', 'amount', 'transaction_date', 'description'],
  loans:          ['member_no', 'principal', 'interest_rate', 'term_months', 'outstanding', 'disbursed_date', 'due_date', 'purpose', 'status'],
  project_shares: ['member_no', 'project_name', 'units', 'amount_paid', 'alloc_date'],
};

function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["\r]/g, ''));
  const rows = lines.slice(1).map(line => {
    // Handle quoted CSV fields
    const values = [];
    let curr = '', inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { values.push(curr.trim()); curr = ''; }
      else { curr += ch; }
    }
    values.push(curr.trim().replace(/\r/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
  return { headers, rows };
}

export default function ImportPage() {
  const [importType, setImportType]     = useState('contributions');
  const [csvText, setCsvText]           = useState('');
  const [parsed, setParsed]             = useState(null);
  const [importing, setImporting]       = useState(false);
  const [result, setResult]             = useState(null);
  const [history, setHistory]           = useState([]);
  const [histLoading, setHistLoading]   = useState(true);
  const [toast, setToast]               = useState(null);
  const [activeTab, setActiveTab]       = useState('import'); // import | history
  const fileRef = useRef();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab]);

  const fetchHistory = async () => {
    setHistLoading(true);
    try {
      const { data } = await api.get('/imports');
      setHistory(data.data);
    } catch {
      setToast({ type: 'error', msg: 'Failed to load import history' });
    }
    setHistLoading(false);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result);
    reader.readAsText(file);
  };

  const handleParse = () => {
    if (!csvText.trim()) return setToast({ type: 'error', msg: 'Paste or upload CSV data first' });
    const { headers, rows } = parseCSV(csvText);
    if (rows.length === 0) return setToast({ type: 'error', msg: 'No data rows found. Check your CSV format.' });
    const expected = TEMPLATES[importType];
    const missing = expected.filter(h => !headers.includes(h));
    if (missing.length > 0) {
      setToast({ type: 'error', msg: `Missing columns: ${missing.join(', ')}. Download template to see required columns.` });
      return;
    }
    setParsed({ headers, rows });
    setResult(null);
    setToast({ type: 'success', msg: `Parsed ${rows.length} rows. Review preview then click Import.` });
  };

  const handleDownloadTemplate = () => {
    const cols = TEMPLATES[importType];
    const exampleRows = {
      contributions:  'MBR-1001,5000,2000,200,2024-01-15,January contributions',
      savings:        'MBR-1001,5000,2024-01-15,January savings deposit',
      shares:         'MBR-1001,2000,2024-01-15,January shares contribution',
      welfare:        'MBR-1001,200,2024-01-15,January welfare contribution',
      loans:          'MBR-1001,100000,14,24,75000,2023-01-01,2025-01-01,Business development,active',
      project_shares: 'MBR-1001,Purchase of Land,2,10000,2024-01-15',
    };
    const csv = [cols.join(','), exampleRows[importType]].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `umoja_import_${importType}_template.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0) return setToast({ type: 'error', msg: 'No rows to import. Parse CSV first.' });
    if (parsed.rows.length > 2000) return setToast({ type: 'error', msg: 'Maximum 2000 rows per import. Split into batches.' });

    const confirm = window.confirm(
      `Import ${parsed.rows.length} ${importType} records? This will update account balances. This cannot be easily undone.`
    );
    if (!confirm) return;

    setImporting(true);
    setResult(null);
    try {
      const { data } = await api.post(`/imports/${importType}`, {
        rows: parsed.rows,
        file_name: `manual_${importType}_${new Date().toISOString().split('T')[0]}`,
      });
      setResult(data.data);
      if (data.data.success === data.data.total) {
        setToast({ type: 'success', msg: `✓ All ${data.data.success} records imported successfully!` });
      } else {
        setToast({ type: 'error', msg: `${data.data.failed} rows failed — see error details below` });
      }
      setParsed(null); setCsvText('');
    } catch (err) {
      setToast({ type: 'error', msg: err.response?.data?.message || 'Import failed. Check your data and try again.' });
    }
    setImporting(false);
  };

  const typeInfo = IMPORT_TYPES.find(t => t.value === importType);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: toast.type === 'error' ? '#FEF2F2' : '#ECFDF5', border: `1px solid ${toast.type === 'error' ? '#FCA5A5' : '#6EE7B7'}`, color: toast.type === 'error' ? '#991B1B' : '#065F46', borderRadius: 10, padding: '12px 18px', fontSize: 13, fontWeight: 500, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxWidth: 400 }}>
          {toast.msg}
          <button onClick={() => setToast(null)} style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Import Historical Records</h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>Migrate old SACCO records into the system via CSV upload</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #E5E7EB' }}>
        {[['import', 'Import Records'], ['history', 'Import History']].map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === tab ? '#1D4ED8' : 'transparent'}`, color: activeTab === tab ? '#1D4ED8' : '#6B7280', padding: '10px 20px', fontSize: 14, fontWeight: activeTab === tab ? 700 : 400, cursor: 'pointer', marginBottom: -2, transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'import' && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start' }}>
          {/* Type selector */}
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Import Type
            </div>
            {IMPORT_TYPES.map(t => (
              <button key={t.value} onClick={() => { setImportType(t.value); setParsed(null); setResult(null); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', background: importType === t.value ? '#EFF6FF' : 'none', borderBottom: '1px solid #F3F4F6', border: 'none', borderLeft: `3px solid ${importType === t.value ? '#1D4ED8' : 'transparent'}`, cursor: 'pointer', transition: 'all 0.1s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{t.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: importType === t.value ? 700 : 500, color: importType === t.value ? '#1D4ED8' : '#111827' }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{t.desc}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Import area */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Step 1 — Template */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1D4ED8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>1</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Download CSV Template</div>
              </div>
              <div style={{ background: '#F0F9FF', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: '#0369A1', fontWeight: 600, marginBottom: 6 }}>Required columns for <strong>{typeInfo.label}</strong>:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TEMPLATES[importType].map(col => (
                    <code key={col} style={{ background: '#BAE6FD', color: '#0C4A6E', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{col}</code>
                  ))}
                </div>
              </div>
              <button onClick={handleDownloadTemplate}
                style={{ background: '#F0FDF4', color: '#15803D', border: '1.5px solid #86EFAC', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ⬇ Download Template CSV
              </button>
            </div>

            {/* Step 2 — Upload */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1D4ED8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>2</div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Upload or Paste CSV Data</div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
                <button onClick={() => fileRef.current.click()}
                  style={{ background: '#F9FAFB', color: '#374151', border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                  📁 Upload .csv file
                </button>
                <span style={{ fontSize: 13, color: '#9CA3AF', alignSelf: 'center' }}>or paste CSV below</span>
              </div>

              <textarea
                rows={8}
                placeholder={`Paste CSV data here…\nExample:\n${TEMPLATES[importType].join(',')}\nMBR-1001,${importType === 'contributions' ? '5000,2000,200' : '5000'},2024-01-15,January record`}
                value={csvText}
                onChange={e => { setCsvText(e.target.value); setParsed(null); }}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button onClick={handleParse}
                  style={{ background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Parse & Preview
                </button>
                {csvText && (
                  <button onClick={() => { setCsvText(''); setParsed(null); setResult(null); }}
                    style={{ background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Step 3 — Preview */}
            {parsed && (
              <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #3B82F6', padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1D4ED8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>3</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Preview — {parsed.rows.length} rows</div>
                  </div>
                  <button onClick={handleImport} disabled={importing}
                    style={{ background: importing ? '#9CA3AF' : '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer' }}>
                    {importing ? '⏳ Importing…' : `⬆ Import ${parsed.rows.length} Records`}
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F0F9FF' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase' }}>#</th>
                        {parsed.headers.map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#0369A1', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 10).map((row, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '7px 12px', color: '#9CA3AF' }}>{i + 1}</td>
                          {parsed.headers.map(h => (
                            <td key={h} style={{ padding: '7px 12px', color: '#111827', whiteSpace: 'nowrap' }}>{row[h] || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.rows.length > 10 && (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: '#9CA3AF', background: '#F9FAFB', textAlign: 'center' }}>
                      + {parsed.rows.length - 10} more rows (not shown)
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 12, background: '#FEF9C3', border: '1px solid #FDE047', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#713F12' }}>
                  ⚠ <strong>Caution:</strong> Importing will credit account balances and create transaction records. Verify your data carefully before importing.
                </div>
              </div>
            )}

            {/* Step 4 — Result */}
            {result && (
              <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${result.failed === 0 ? '#6EE7B7' : '#FCA5A5'}`, padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, color: result.failed === 0 ? '#065F46' : '#991B1B' }}>
                  {result.failed === 0 ? '✅ Import Complete!' : '⚠ Import Completed with Errors'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                  <div style={{ textAlign: 'center', background: '#F9FAFB', borderRadius: 10, padding: '12px 0' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>{result.total}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>Total Rows</div>
                  </div>
                  <div style={{ textAlign: 'center', background: '#ECFDF5', borderRadius: 10, padding: '12px 0' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#065F46' }}>{result.success}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>Imported</div>
                  </div>
                  <div style={{ textAlign: 'center', background: result.failed > 0 ? '#FEF2F2' : '#ECFDF5', borderRadius: 10, padding: '12px 0' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: result.failed > 0 ? '#991B1B' : '#065F46' }}>{result.failed}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF' }}>Failed</div>
                  </div>
                </div>

                {result.errors?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#991B1B', marginBottom: 8 }}>Error Details (first 50):</div>
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #FCA5A5', borderRadius: 8 }}>
                      {result.errors.map((err, i) => (
                        <div key={i} style={{ padding: '7px 12px', fontSize: 12, borderBottom: '1px solid #FEE2E2', color: '#7F1D1D' }}>
                          <strong>Row {err.row}</strong>
                          {err.member_no && <span style={{ marginLeft: 6, color: '#9CA3AF' }}>[{err.member_no}]</span>}
                          : {err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          {histLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF' }}>No imports yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['Type', 'File', 'Total', 'Success', 'Failed', 'Status', 'Imported By', 'Date'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(imp => (
                  <tr key={imp.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{imp.import_type}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6B7280', fontSize: 12 }}>{imp.file_name}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{imp.total_rows}</td>
                    <td style={{ padding: '10px 14px', color: '#065F46', fontWeight: 600 }}>{imp.success_rows}</td>
                    <td style={{ padding: '10px 14px', color: imp.failed_rows > 0 ? '#991B1B' : '#9CA3AF', fontWeight: 600 }}>{imp.failed_rows}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: imp.status === 'done' ? '#ECFDF5' : imp.status === 'failed' ? '#FEF2F2' : '#FFF7ED', color: imp.status === 'done' ? '#065F46' : imp.status === 'failed' ? '#991B1B' : '#92400E', padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>
                        {imp.status?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{imp.imported_by_name}</td>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 12 }}>{formatDate(imp.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
