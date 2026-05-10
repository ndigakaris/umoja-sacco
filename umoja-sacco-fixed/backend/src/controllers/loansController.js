/**
 * Loans Controller — Application, Approval Workflow, Disbursement, Repayments
 */

const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const { v4: uuidv4 } = require('uuid');

/**
 * Calculate monthly payment (reducing balance)
 */
function calcMonthlyPayment(principal, annualRate, termMonths, method) {
  if (method === 'flat') {
    const totalInterest = principal * (annualRate / 100) * (termMonths / 12);
    return { monthly: (principal + totalInterest) / termMonths, totalInterest, totalPayable: principal + totalInterest };
  }
  const r = annualRate / 100 / 12;
  const monthly = r === 0 ? principal / termMonths : principal * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1);
  const totalPayable = monthly * termMonths;
  return { monthly, totalInterest: totalPayable - principal, totalPayable };
}

/**
 * GET /api/loans
 */
exports.listLoans = async (req, res, next) => {
  try {
    const { status, user_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const where = [];

    // Members can only see their own loans
    if (req.user.role === 'member') {
      params.push(req.user.id);
      where.push(`l.user_id = $${params.length}`);
    } else if (user_id) {
      params.push(user_id);
      where.push(`l.user_id = $${params.length}`);
    }
    if (status) { params.push(status); where.push(`l.status = $${params.length}`); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT l.*, u.full_name, u.member_no, lp.name AS product_name
       FROM loans l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN loan_products lp ON lp.id = l.product_id
       ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/loans
 * Submit a loan application
 */
exports.applyLoan = async (req, res, next) => {
  try {
    const { product_id, principal, term_months, purpose, guarantor_ids = [] } = req.body;
    const userId = req.user.role === 'member' ? req.user.id : (req.body.user_id || req.user.id);

    await withTransaction(async (client) => {
      // Fetch product
      const { rows: [product] } = await client.query(
        'SELECT * FROM loan_products WHERE id = $1 AND is_active = true', [product_id]
      );
      if (!product) throw Object.assign(new Error('Loan product not found or inactive'), { statusCode: 404 });
      if (principal < product.min_amount || principal > product.max_amount) {
        throw Object.assign(new Error(`Amount must be between KES ${product.min_amount} and KES ${product.max_amount}`), { statusCode: 400 });
      }

      // Check member savings for multiplier eligibility
      const { rows: [savingsAcc] } = await client.query(
        `SELECT balance FROM accounts WHERE user_id = $1 AND type = 'savings'`, [userId]
      );
      const maxByMultiplier = (savingsAcc?.balance || 0) * product.max_multiplier;
      if (principal > maxByMultiplier) {
        throw Object.assign(new Error(`Loan exceeds ${product.max_multiplier}x your savings balance (max KES ${maxByMultiplier.toLocaleString()})`), { statusCode: 400 });
      }

      // Generate reference
      const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM loans WHERE user_id = $1', [userId]);
      const memberNo = (await client.query('SELECT member_no FROM users WHERE id = $1', [userId])).rows[0]?.member_no || 'MBR';
      const ref = `LN-${memberNo}-${String(parseInt(count) + 1).padStart(2, '0')}`;

      const { monthly, totalInterest, totalPayable } = calcMonthlyPayment(principal, product.interest_rate, term_months, product.interest_method);
      const processingFee = principal * (product.processing_fee_pct / 100);

      const { rows: [loan] } = await client.query(
        `INSERT INTO loans (id, reference, user_id, product_id, principal, interest_rate, interest_method, term_months, monthly_payment, total_payable, total_interest, processing_fee, outstanding, status, purpose, application_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,CURRENT_DATE) RETURNING *`,
        [uuidv4(), ref, userId, product_id, principal, product.interest_rate, product.interest_method, term_months,
         Math.round(monthly * 100) / 100, Math.round(totalPayable * 100) / 100,
         Math.round(totalInterest * 100) / 100, Math.round(processingFee * 100) / 100, principal, purpose]
      );

      // Add guarantors
      for (const gId of guarantor_ids) {
        await client.query(
          `INSERT INTO loan_guarantors (id, loan_id, member_id) VALUES ($1,$2,$3)`,
          [uuidv4(), loan.id, gId]
        );
      }

      // Create first approval step (Treasurer)
      await client.query(
        `INSERT INTO loan_approvals (id, loan_id, step) VALUES ($1,$2,1)`,
        [uuidv4(), loan.id]
      );

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'LOAN_APPLY', entityType: 'loan', entityId: loan.id,
        description: `Loan application ${ref} — KES ${principal.toLocaleString()}`, ip: req.ip,
      });

      res.status(201).json({ success: true, message: 'Loan application submitted', data: loan });
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/loans/:id/approve
 * Maker-checker: Treasurer (step 1) then Admin (step 2)
 */
exports.approveLoan = async (req, res, next) => {
  try {
    const { action, comment } = req.body; // 'approved' | 'rejected' | 'referred'
    const { id } = req.params;

    await withTransaction(async (client) => {
      const { rows: [loan] } = await client.query('SELECT * FROM loans WHERE id = $1', [id]);
      if (!loan) throw Object.assign(new Error('Loan not found'), { statusCode: 404 });
      if (!['pending', 'under_review'].includes(loan.status)) {
        throw Object.assign(new Error('Loan is not awaiting approval'), { statusCode: 400 });
      }

      // Determine current step
      const { rows: steps } = await client.query(
        `SELECT * FROM loan_approvals WHERE loan_id = $1 ORDER BY step ASC`, [id]
      );
      const pendingStep = steps.find(s => !s.actor_id);
      if (!pendingStep) throw Object.assign(new Error('No pending approval step'), { statusCode: 400 });

      // Validate role matches step
      if (pendingStep.step === 1 && !['treasurer', 'admin'].includes(req.user.role)) {
        throw Object.assign(new Error('Step 1 requires Treasurer or Admin role'), { statusCode: 403 });
      }
      if (pendingStep.step === 2 && req.user.role !== 'admin') {
        throw Object.assign(new Error('Step 2 requires Admin role'), { statusCode: 403 });
      }

      // Record this step's action
      await client.query(
        `UPDATE loan_approvals SET actor_id = $1, action = $2, comment = $3, acted_at = NOW() WHERE id = $4`,
        [req.user.id, action, comment, pendingStep.id]
      );

      let newStatus = loan.status;

      if (action === 'rejected') {
        newStatus = 'rejected';
      } else if (action === 'approved') {
        if (pendingStep.step === 1) {
          // Move to step 2 (Admin)
          newStatus = 'under_review';
          await client.query(
            `INSERT INTO loan_approvals (id, loan_id, step) VALUES ($1,$2,2)`, [uuidv4(), id]
          );
        } else {
          // Final approval
          newStatus = 'approved';
        }
      }

      await client.query(`UPDATE loans SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, id]);

      // Create notification for member
      await createNotification(client, {
        userId: loan.user_id,
        title: `Loan Application ${action === 'approved' && pendingStep.step === 2 ? 'Fully Approved' : action.charAt(0).toUpperCase() + action.slice(1)}`,
        message: comment || `Your loan application ${loan.reference} has been ${action}.`,
        type: 'loan', relatedId: id,
      });

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: `LOAN_${action.toUpperCase()}`, entityType: 'loan', entityId: id,
        description: `Loan ${loan.reference} — Step ${pendingStep.step} ${action}`, ip: req.ip,
      });

      res.json({ success: true, message: `Loan ${action} at step ${pendingStep.step}`, data: { status: newStatus } });
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/loans/:id/disburse
 * Treasurer or Admin disburses an approved loan
 */
exports.disburseLoan = async (req, res, next) => {
  try {
    const { id } = req.params;

    await withTransaction(async (client) => {
      const { rows: [loan] } = await client.query('SELECT * FROM loans WHERE id = $1', [id]);
      if (!loan) throw Object.assign(new Error('Loan not found'), { statusCode: 404 });
      if (loan.status !== 'approved') {
        throw Object.assign(new Error('Loan must be in approved status to disburse'), { statusCode: 400 });
      }

      // Update loan to active
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + loan.term_months);
      await client.query(
        `UPDATE loans SET status = 'active', disbursed_at = NOW(), disbursed_by = $1, due_date = $2, updated_at = NOW() WHERE id = $3`,
        [req.user.id, dueDate, id]
      );

      // Record transaction
      const txRef = `TXN-${Date.now().toString().slice(-8)}`;
      await client.query(
        `INSERT INTO transactions (id, reference, user_id, type, credit, description, related_id, recorded_by, transaction_date)
         VALUES ($1,$2,$3,'loan',$4,$5,$6,$7,CURRENT_DATE)`,
        [uuidv4(), txRef, loan.user_id, loan.principal, `Loan disbursement — ${loan.reference}`, id, req.user.id]
      );

      await createNotification(client, {
        userId: loan.user_id,
        title: 'Loan Disbursed',
        message: `KES ${Number(loan.principal).toLocaleString()} has been disbursed for loan ${loan.reference}. First payment due in 30 days.`,
        type: 'loan', relatedId: id,
      });

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'LOAN_DISBURSE', entityType: 'loan', entityId: id,
        description: `Loan ${loan.reference} disbursed — KES ${Number(loan.principal).toLocaleString()}`, ip: req.ip,
      });

      res.json({ success: true, message: 'Loan disbursed successfully' });
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/loans/:id/repay
 * Record a loan repayment
 */
exports.recordRepayment = async (req, res, next) => {
  try {
    const { amount, payment_date } = req.body;
    const { id } = req.params;

    await withTransaction(async (client) => {
      const { rows: [loan] } = await client.query('SELECT * FROM loans WHERE id = $1', [id]);
      if (!loan || loan.status !== 'active') {
        throw Object.assign(new Error('Active loan not found'), { statusCode: 404 });
      }
      if (amount > loan.outstanding) {
        throw Object.assign(new Error(`Amount exceeds outstanding balance of KES ${loan.outstanding}`), { statusCode: 400 });
      }

      const newOutstanding = parseFloat(loan.outstanding) - parseFloat(amount);
      const newTotalPaid = parseFloat(loan.total_paid) + parseFloat(amount);
      const newStatus = newOutstanding <= 0 ? 'completed' : 'active';

      await client.query(
        `UPDATE loans SET outstanding = $1, total_paid = $2, status = $3, updated_at = NOW() WHERE id = $4`,
        [newOutstanding, newTotalPaid, newStatus, id]
      );

      const repRef = `REP-${Date.now().toString().slice(-8)}`;
      await client.query(
        `INSERT INTO repayments (id, reference, loan_id, user_id, amount, balance_after, recorded_by, payment_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [uuidv4(), repRef, id, loan.user_id, amount, newOutstanding, req.user.id, payment_date || new Date()]
      );

      const txRef = `TXN-${Date.now().toString().slice(-8)}`;
      await client.query(
        `INSERT INTO transactions (id, reference, user_id, type, debit, description, related_id, recorded_by, transaction_date)
         VALUES ($1,$2,$3,'repayment',$4,$5,$6,$7,CURRENT_DATE)`,
        [uuidv4(), txRef, loan.user_id, amount, `Loan repayment — ${loan.reference}`, id, req.user.id]
      );

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'LOAN_REPAYMENT', entityType: 'loan', entityId: id,
        description: `Repayment KES ${amount} on ${loan.reference}. Remaining: KES ${newOutstanding}`, ip: req.ip,
      });

      res.json({ success: true, message: 'Repayment recorded', data: { outstanding: newOutstanding, status: newStatus } });
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/loans/:id/schedule
 * Generate repayment schedule
 */
exports.getSchedule = async (req, res, next) => {
  try {
    const { rows: [loan] } = await query(
      'SELECT * FROM loans WHERE id = $1', [req.params.id]
    );
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });

    const schedule = [];
    let balance = parseFloat(loan.principal);
    const r = parseFloat(loan.interest_rate) / 100 / 12;
    const monthly = parseFloat(loan.monthly_payment);
    const startDate = loan.disbursed_at ? new Date(loan.disbursed_at) : new Date();

    for (let i = 1; i <= loan.term_months; i++) {
      const interestPortion = loan.interest_method === 'reducing' ? balance * r : parseFloat(loan.total_interest) / loan.term_months;
      const principalPortion = monthly - interestPortion;
      balance = Math.max(0, balance - principalPortion);
      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      schedule.push({
        installment: i,
        due_date: dueDate.toISOString().split('T')[0],
        payment: Math.round(monthly * 100) / 100,
        principal: Math.round(principalPortion * 100) / 100,
        interest: Math.round(interestPortion * 100) / 100,
        balance: Math.round(balance * 100) / 100,
      });
    }

    res.json({ success: true, data: schedule });
  } catch (err) {
    next(err);
  }
};
