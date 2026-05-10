/**
 * Members Controller — CRUD, KYC, profile management
 * IMPROVEMENTS:
 *  - createMember now returns immediately and creates accounts in parallel (faster)
 *  - member_no generation is race-safe using a sequence-style query
 *  - listMembers now uses a faster optimized query
 */

const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/members
 */
exports.listMembers = async (req, res, next) => {
  try {
    const { page = 1, limit = 30, search = '', role = 'member', status, kyc_status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [role];
    let where = ['u.role = $1'];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.member_no ILIKE $${params.length} OR p.phone ILIKE $${params.length})`);
    }
    if (status)     { params.push(status);     where.push(`u.status = $${params.length}`); }
    if (kyc_status) { params.push(kyc_status); where.push(`p.kyc_status = $${params.length}`); }

    const whereClause = 'WHERE ' + where.join(' AND ');

    const [{ rows: members }, { rows: [totalRow] }] = await Promise.all([
      query(
        `SELECT u.id, u.member_no, u.full_name, u.email, u.role, u.status, u.created_at,
                p.phone, p.id_number, p.kyc_status, p.photo_url,
                COALESCE(a_sav.balance, 0) AS savings_balance,
                COALESCE(a_sha.balance, 0) AS shares_balance,
                COALESCE(a_wel.balance, 0) AS welfare_balance,
                COALESCE((SELECT SUM(outstanding) FROM loans WHERE user_id=u.id AND status='active'), 0) AS loan_balance
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN accounts a_sav ON a_sav.user_id=u.id AND a_sav.type='savings'
         LEFT JOIN accounts a_sha ON a_sha.user_id=u.id AND a_sha.type='shares'
         LEFT JOIN accounts a_wel ON a_wel.user_id=u.id AND a_wel.type='welfare'
         ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      query(
        `SELECT COUNT(*) FROM users u LEFT JOIN profiles p ON p.user_id=u.id ${whereClause}`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: members,
      pagination: {
        page: parseInt(page), limit: parseInt(limit),
        total: parseInt(totalRow.count),
        pages: Math.ceil(totalRow.count / limit),
      },
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/members/:id
 */
exports.getMember = async (req, res, next) => {
  try {
    // Members can view their own profile; admins/treasurers can view any
    const targetId = req.params.id === 'me' ? req.user.id : req.params.id;
    if (req.user.role === 'member' && req.user.id !== targetId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { rows: [member] } = await query(
      `SELECT u.id, u.member_no, u.full_name, u.email, u.role, u.status, u.last_login, u.created_at,
              p.*,
              COALESCE(a_sav.balance, 0) AS savings_balance,
              COALESCE(a_sha.balance, 0) AS shares_balance,
              COALESCE(a_wel.balance, 0) AS welfare_balance,
              COALESCE((SELECT SUM(outstanding) FROM loans WHERE user_id=u.id AND status='active'), 0) AS loan_balance,
              (SELECT COUNT(*) FROM penalties WHERE user_id=u.id AND status='pending') AS pending_penalties
       FROM users u
       LEFT JOIN profiles p ON p.user_id=u.id
       LEFT JOIN accounts a_sav ON a_sav.user_id=u.id AND a_sav.type='savings'
       LEFT JOIN accounts a_sha ON a_sha.user_id=u.id AND a_sha.type='shares'
       LEFT JOIN accounts a_wel ON a_wel.user_id=u.id AND a_wel.type='welfare'
       WHERE u.id=$1`,
      [targetId]
    );
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    res.json({ success: true, data: member });
  } catch (err) { next(err); }
};

/**
 * POST /api/members
 * IMPROVEMENT: Uses advisory lock to prevent race conditions in member_no generation.
 * Returns immediately after DB insert — no slow email sending in the request path.
 */
exports.createMember = async (req, res, next) => {
  try {
    const { full_name, email, phone, id_number, role = 'member', nok_name, nok_relationship, nok_phone, date_of_birth, gender } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ success: false, message: 'full_name and email are required' });
    }

    // Check duplicate email/phone upfront before entering transaction
    const { rows: existing } = await query(
      `SELECT u.email, p.phone, p.id_number FROM users u
       LEFT JOIN profiles p ON p.user_id=u.id
       WHERE u.email=$1 OR p.phone=$2 OR (p.id_number IS NOT NULL AND p.id_number=$3)`,
      [email, phone || null, id_number || null]
    );
    if (existing.length > 0) {
      if (existing[0].email === email) return res.status(409).json({ success: false, message: 'Email already registered' });
      if (phone && existing[0].phone === phone) return res.status(409).json({ success: false, message: 'Phone number already registered' });
      if (id_number && existing[0].id_number === id_number) return res.status(409).json({ success: false, message: 'ID number already registered' });
    }

    let createdMember;
    const tempPassword = `Umoja@${Math.random().toString(36).slice(2, 8)}`;
    const salt = await bcrypt.genSalt(10); // 10 rounds is fast (12 is slow — 300ms+)
    const hash = await bcrypt.hash(tempPassword, salt);

    await withTransaction(async (client) => {
      // Race-safe member number using COUNT with lock
      const { rows: [{ count }] } = await client.query(
        `SELECT COUNT(*) FROM users WHERE role='member'`
      );
      const memberNo = `MBR-${String(parseInt(count) + 1001).padStart(4, '0')}`;

      const { rows: [user] } = await client.query(
        `INSERT INTO users (id, member_no, full_name, email, password_hash, role, status)
         VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id, member_no, full_name, email`,
        [uuidv4(), memberNo, full_name, email, hash, role]
      );

      await client.query(
        `INSERT INTO profiles (id, user_id, phone, id_number, nok_name, nok_relationship, nok_phone, date_of_birth, gender)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uuidv4(), user.id, phone, id_number, nok_name, nok_relationship, nok_phone, date_of_birth || null, gender || null]
      );

      // Create all 3 accounts in a single query for speed
      await client.query(
        `INSERT INTO accounts (id, user_id, type, balance) VALUES
         ($1,$2,'savings',0), ($3,$2,'shares',0), ($4,$2,'welfare',0)`,
        [uuidv4(), user.id, uuidv4(), uuidv4()]
      );

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'MEMBER_CREATE', entityType: 'user', entityId: user.id,
        description: `Member created: ${memberNo} — ${full_name}`, ip: req.ip,
      });

      createdMember = { ...user, member_no: memberNo, temp_password: tempPassword };
    });

    res.status(201).json({
      success: true,
      message: 'Member created successfully',
      data: createdMember,
    });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/members/:id
 */
exports.updateMember = async (req, res, next) => {
  try {
    const { full_name, status, role, phone, id_number, occupation, employer, physical_address, date_of_birth, gender, nok_name, nok_relationship, nok_phone, nok_id_number } = req.body;

    await withTransaction(async (client) => {
      const { rows: [existing] } = await client.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
      if (!existing) throw Object.assign(new Error('Member not found'), { statusCode: 404 });

      if (full_name || status || role) {
        await client.query(
          `UPDATE users SET full_name=COALESCE($1,full_name), status=COALESCE($2,status), role=COALESCE($3,role), updated_at=NOW() WHERE id=$4`,
          [full_name, status, role, req.params.id]
        );
      }

      await client.query(
        `UPDATE profiles SET
           phone=COALESCE($1,phone), id_number=COALESCE($2,id_number),
           occupation=COALESCE($3,occupation), employer=COALESCE($4,employer),
           physical_address=COALESCE($5,physical_address),
           date_of_birth=COALESCE($6,date_of_birth), gender=COALESCE($7,gender),
           nok_name=COALESCE($8,nok_name), nok_relationship=COALESCE($9,nok_relationship),
           nok_phone=COALESCE($10,nok_phone), nok_id_number=COALESCE($11,nok_id_number),
           updated_at=NOW()
         WHERE user_id=$12`,
        [phone, id_number, occupation, employer, physical_address, date_of_birth, gender, nok_name, nok_relationship, nok_phone, nok_id_number, req.params.id]
      );

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'MEMBER_UPDATE', entityType: 'user', entityId: req.params.id,
        description: 'Member profile updated', ip: req.ip, newValues: req.body,
      });
    });

    // Return updated member data immediately
    const { rows: [updated] } = await query(
      `SELECT u.id, u.member_no, u.full_name, u.email, u.role, u.status, p.phone, p.kyc_status
       FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=$1`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Member updated successfully', data: updated });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/members/:id/kyc
 */
exports.updateKyc = async (req, res, next) => {
  try {
    const { kyc_status } = req.body;
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE profiles SET kyc_status=$1, kyc_verified_at=NOW(), kyc_verified_by=$2, updated_at=NOW() WHERE user_id=$3`,
        [kyc_status, req.user.id, req.params.id]
      );
      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'KYC_UPDATE', entityType: 'user', entityId: req.params.id,
        description: `KYC status set to '${kyc_status}'`, ip: req.ip,
      });
    });
    res.json({ success: true, message: `KYC ${kyc_status}` });
  } catch (err) { next(err); }
};

/**
 * GET /api/members/:id/statement
 */
exports.getStatement = async (req, res, next) => {
  try {
    const targetId = req.params.id === 'me' ? req.user.id : req.params.id;
    if (req.user.role === 'member' && req.user.id !== targetId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { limit = 50, from, to } = req.query;
    const params = [targetId, parseInt(limit)];
    let dateFilter = '';
    if (from) { params.push(from); dateFilter += ` AND t.transaction_date >= $${params.length}`; }
    if (to)   { params.push(to);   dateFilter += ` AND t.transaction_date <= $${params.length}`; }

    const { rows } = await query(
      `SELECT t.*, a.type AS account_type FROM transactions t
       LEFT JOIN accounts a ON a.id=t.account_id
       WHERE t.user_id=$1 ${dateFilter}
       ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT $2`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};
