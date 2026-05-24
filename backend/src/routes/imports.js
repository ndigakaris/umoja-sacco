/**
 * backend/src/routes/imports.js
 *
 * Bulk Import — import historical records (savings, shares, welfare, loans,
 * contributions, project_shares) via JSON array payload.
 *
 * Frontend sends parsed CSV rows as JSON.
 * Each row is validated individually; failures are collected and returned.
 *
 * Routes:
 *   GET  /api/imports               — list past import jobs
 *   POST /api/imports/:type         — submit bulk import
 *   GET  /api/imports/template/:type — download CSV template (column headers)
 */

const express = require('express');
const router  = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { v4: uuidv4 } = require('uuid');

const VALID_TYPES = new Set(['savings', 'shares', 'welfare', 'loans', 'contributions', 'project_shares']);

/* ─── CSV Templates (column headers + example row) ──────────────────────── */
const TEMPLATES = {
  savings: {
    headers: ['member_no', 'amount', 'transaction_date', 'description'],
    example: ['MBR-1001', '5000', '2024-01-15', 'January savings deposit'],
  },
  shares: {
    headers: ['member_no', 'amount', 'transaction_date', 'description'],
    example: ['MBR-1001', '2000', '2024-01-15', 'January shares contribution'],
  },
  welfare: {
    headers: ['member_no', 'amount', 'transaction_date', 'description'],
    example: ['MBR-1001', '200', '2024-01-15', 'January welfare contribution'],
  },
  contributions: {
    headers: ['member_no', 'savings_amount', 'shares_amount', 'welfare_amount', 'transaction_date', 'description'],
    example: ['MBR-1001', '5000', '2000', '200', '2024-01-15', 'January contributions'],
  },
  loans: {
    headers: ['member_no', 'principal', 'interest_rate', 'term_months', 'outstanding', 'disbursed_date', 'due_date', 'purpose', 'status'],
    example: ['MBR-1001', '100000', '14', '24', '75000', '2023-01-01', '2025-01-01', 'Business development', 'active'],
  },
  project_shares: {
    headers: ['member_no', 'project_name', 'units', 'amount_paid', 'alloc_date'],
    example: ['MBR-1001', 'Purchase of Land', '2', '10000', '2024-01-15'],
  },
};

/* ─── GET /api/imports/template/:type ───────────────────────────────────── */
router.get('/template/:type', authenticate, authorize('admin', 'treasurer'), (req, res) => {
  const type = req.params.type;
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ success: false, message: `Invalid type. Must be one of: ${[...VALID_TYPES].join(', ')}` });
  }

  const t = TEMPLATES[type];
  const csv = [t.headers.join(','), t.example.join(',')].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="umoja_import_${type}_template.csv"`);
  res.send(csv);
});

/* ─── GET /api/imports ───────────────────────────────────────────────────── */
router.get('/', authenticate, authorize('admin', 'treasurer', 'auditor'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT bi.*, u.full_name AS imported_by_name
       FROM bulk_imports bi
       LEFT JOIN users u ON u.id = bi.imported_by
       ORDER BY bi.started_at DESC
       LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/* ─── POST /api/imports/:type ────────────────────────────────────────────── */
router.post('/:type', authenticate, authorize('admin', 'treasurer'), async (req, res, next) => {
  const type = req.params.type;
  if (!VALID_TYPES.has(type)) {
    return res.status(400).json({ success: false, message: `Invalid import type. Valid: ${[...VALID_TYPES].join(', ')}` });
  }

  const { rows: importRows, file_name = 'manual_import' } = req.body;
  if (!Array.isArray(importRows) || importRows.length === 0) {
    return res.status(400).json({ success: false, message: 'rows must be a non-empty array' });
  }

  if (importRows.length > 2000) {
    return res.status(400).json({ success: false, message: 'Maximum 2000 rows per import. Split into batches.' });
  }

  // Create the import log entry
  const importId = uuidv4();
  await query(
    `INSERT INTO bulk_imports (id, import_type, file_name, total_rows, status, imported_by)
     VALUES ($1, $2, $3, $4, 'processing', $5)`,
    [importId, type, file_name, importRows.length, req.user.id]
  );

  const errors = [];
  let successCount = 0;

  try {
    // Build member_no → user_id map for all referenced members
    const memberNos = [...new Set(importRows.map(r => r.member_no).filter(Boolean))];
    const { rows: members } = await query(
      `SELECT u.id, u.member_no,
              a_sav.id AS savings_acc, a_sha.id AS shares_acc, a_wel.id AS welfare_acc
       FROM users u
       LEFT JOIN accounts a_sav ON a_sav.user_id = u.id AND a_sav.type = 'savings'
       LEFT JOIN accounts a_sha ON a_sha.user_id = u.id AND a_sha.type = 'shares'
       LEFT JOIN accounts a_wel ON a_wel.user_id = u.id AND a_wel.type = 'welfare'
       WHERE u.member_no = ANY($1)`,
      [memberNos]
    );
    const memberMap = Object.fromEntries(members.map(m => [m.member_no, m]));

    // Project name map (for project_shares type)
    let projectMap = {};
    if (type === 'project_shares') {
      const projectNames = [...new Set(importRows.map(r => r.project_name).filter(Boolean))];
      if (projectNames.length > 0) {
        const { rows: projects } = await query(
          `SELECT id, name FROM projects WHERE name = ANY($1)`,
          [projectNames]
        );
        projectMap = Object.fromEntries(projects.map(p => [p.name, p.id]));
      }
    }

    // Process each row
    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i];
      const rowNum = i + 1;

      try {
        const member = memberMap[row.member_no];
        if (!member) {
          errors.push({ row: rowNum, member_no: row.member_no, error: `Member ${row.member_no} not found` });
          continue;
        }

        await processRow(type, row, member, projectMap, req.user.id, rowNum);
        successCount++;
      } catch (rowErr) {
        errors.push({ row: rowNum, member_no: row.member_no, error: rowErr.message });
      }
    }
  } catch (fatalErr) {
    await query(
      `UPDATE bulk_imports SET status = 'failed', completed_at = NOW(), errors = $1 WHERE id = $2`,
      [JSON.stringify([{ row: 0, error: fatalErr.message }]), importId]
    );
    return next(fatalErr);
  }

  // Update import log
  const finalStatus = errors.length === importRows.length ? 'failed' : 'done';
  await query(
    `UPDATE bulk_imports
     SET status = $1, success_rows = $2, failed_rows = $3, errors = $4, completed_at = NOW()
     WHERE id = $5`,
    [finalStatus, successCount, errors.length, JSON.stringify(errors), importId]
  );

  await logAudit(null, {
    actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
    action: 'BULK_IMPORT', entityType: 'import', entityId: importId,
    description: `Bulk import: ${type}, ${successCount}/${importRows.length} rows succeeded`,
    ip: req.ip,
  });

  res.json({
    success: true,
    message: `Import complete: ${successCount} succeeded, ${errors.length} failed`,
    data: {
      import_id: importId,
      total: importRows.length,
      success: successCount,
      failed: errors.length,
      errors: errors.slice(0, 50), // return first 50 errors to client
    },
  });
});

// ─── Row processors ────────────────────────────────────────────────────────
async function processRow(type, row, member, projectMap, actorId, rowNum) {
  switch (type) {
    case 'savings':
      return importAccountCredit(member, member.savings_acc, 'savings', row);
    case 'shares':
      return importAccountCredit(member, member.shares_acc, 'shares', row);
    case 'welfare':
      return importAccountCredit(member, member.welfare_acc, 'welfare', row);
    case 'contributions':
      return importContributions(member, row);
    case 'loans':
      return importLoan(member, row, actorId);
    case 'project_shares':
      return importProjectShare(member, row, projectMap, actorId);
    default:
      throw new Error(`Unknown type: ${type}`);
  }
}

async function importAccountCredit(member, accountId, accountType, row) {
  const amount = parseFloat(row.amount);
  if (isNaN(amount) || amount <= 0) throw new Error(`Invalid amount: ${row.amount}`);
  if (!accountId) throw new Error(`Member has no ${accountType} account`);

  const txDate = row.transaction_date || new Date().toISOString().split('T')[0];
  const ref = `IMP-${accountType.toUpperCase().slice(0,3)}-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [amount, accountId]
    );
    const { rows: [acc] } = await client.query(`SELECT balance FROM accounts WHERE id = $1`, [accountId]);
    await client.query(
      `INSERT INTO transactions (id, reference, user_id, account_id, type, credit, balance_after, description, recorded_by, transaction_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        uuidv4(), ref, member.id, accountId, accountType,
        amount, acc.balance,
        row.description || `Imported ${accountType} record`,
        null, txDate,
      ]
    );
  });
}

async function importContributions(member, row) {
  const savingsAmt = parseFloat(row.savings_amount || 0);
  const sharesAmt  = parseFloat(row.shares_amount  || 0);
  const welfareAmt = parseFloat(row.welfare_amount || 0);
  const txDate = row.transaction_date || new Date().toISOString().split('T')[0];
  const desc = row.description || 'Imported contribution record';

  if (savingsAmt > 0) await importAccountCredit(member, member.savings_acc, 'savings', { amount: savingsAmt, transaction_date: txDate, description: desc });
  if (sharesAmt  > 0) await importAccountCredit(member, member.shares_acc,  'shares',  { amount: sharesAmt,  transaction_date: txDate, description: desc });
  if (welfareAmt > 0) await importAccountCredit(member, member.welfare_acc, 'welfare', { amount: welfareAmt, transaction_date: txDate, description: desc });
}

async function importLoan(member, row, actorId) {
  const principal = parseFloat(row.principal);
  if (isNaN(principal) || principal <= 0) throw new Error(`Invalid principal: ${row.principal}`);

  const validStatuses = ['draft','pending','approved','active','completed','defaulted'];
  const status = validStatuses.includes(row.status) ? row.status : 'active';
  const outstanding = parseFloat(row.outstanding ?? principal);
  const ref = `IMP-LN-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;

  await query(
    `INSERT INTO loans
       (id, reference, user_id, principal, interest_rate, interest_method,
        term_months, outstanding, total_paid, status, disbursed_at, due_date, purpose, created_at)
     VALUES ($1,$2,$3,$4,$5,'reducing',$6,$7,$8,$9,$10,$11,$12,NOW())`,
    [
      uuidv4(), ref, member.id,
      principal, parseFloat(row.interest_rate || 0),
      parseInt(row.term_months || 12),
      outstanding, principal - outstanding,
      status,
      row.disbursed_date || null,
      row.due_date || null,
      row.purpose || 'Imported loan record',
    ]
  );
}

async function importProjectShare(member, row, projectMap, actorId) {
  const projectId = projectMap[row.project_name];
  if (!projectId) throw new Error(`Project "${row.project_name}" not found. Create it first.`);

  const units = parseFloat(row.units || 0);
  const amountPaid = parseFloat(row.amount_paid || 0);
  const allocDate = row.alloc_date || new Date().toISOString().split('T')[0];

  await query(
    `INSERT INTO project_share_allocations (id, project_id, user_id, units, amount_paid, recorded_by, alloc_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (project_id, user_id) DO UPDATE SET
       units = project_share_allocations.units + $4,
       amount_paid = project_share_allocations.amount_paid + $5,
       updated_at = NOW()`,
    [uuidv4(), projectId, member.id, units, amountPaid, actorId, allocDate]
  );
}

module.exports = router;
