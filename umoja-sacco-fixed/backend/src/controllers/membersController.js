/**
 * Members Controller — CRUD, KYC, profile management
 */

const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/members
 * Admin/Treasurer: list all members with pagination + search
 */
exports.listMembers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search = '', role = 'member', status, kyc_status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = ['u.role = $1'];
    params.push(role);

    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.member_no ILIKE $${params.length} OR p.id_number ILIKE $${params.length})`);
    }
    if (status) { params.push(status); where.push(`u.status = $${params.length}`); }
    if (kyc_status) { params.push(kyc_status); where.push(`p.kyc_status = $${params.length}`); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const [{ rows: members }, { rows: total }] = await Promise.all([
      query(
        `SELECT u.id, u.member_no, u.full_name, u.email, u.role, u.status, u.created_at,
                p.phone, p.id_number, p.kyc_status, p.photo_url,
                COALESCE(a_sav.balance, 0) AS savings_balance,
                COALESCE(a_sha.balance, 0) AS shares_balance,
                COALESCE(a_wel.balance, 0) AS welfare_balance,
                COALESCE(SUM(l.outstanding) FILTER (WHERE l.status = 'active'), 0) AS loan_balance
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN accounts a_sav ON a_sav.user_id = u.id AND a_sav.type = 'savings'
         LEFT JOIN accounts a_sha ON a_sha.user_id = u.id AND a_sha.type = 'shares'
         LEFT JOIN accounts a_wel ON a_wel.user_id = u.id AND a_wel.type = 'welfare'
         LEFT JOIN loans l ON l.user_id = u.id
         ${whereClause}
         GROUP BY u.id, p.phone, p.id_number, p.kyc_status, p.photo_url, a_sav.balance, a_sha.balance, a_wel.balance
         ORDER BY u.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
      query(
        `SELECT COUNT(*) FROM users u LEFT JOIN profiles p ON p.user_id = u.id ${whereClause}`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: members,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(total[0].count), pages: Math.ceil(total[0].count / limit) },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/members/:id
 */
exports.getMember = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.member_no, u.full_name, u.email, u.role, u.status, u.last_login, u.created_at,
              p.*,
              COALESCE(a_sav.balance, 0) AS savings_balance,
              COALESCE(a_sha.balance, 0) AS shares_balance,
              COALESCE(a_wel.balance, 0) AS welfare_balance
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN accounts a_sav ON a_sav.user_id = u.id AND a_sav.type = 'savings'
       LEFT JOIN accounts a_sha ON a_sha.user_id = u.id AND a_sha.type = 'shares'
       LEFT JOIN accounts a_wel ON a_wel.user_id = u.id AND a_wel.type = 'welfare'
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Member not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/members
 * Admin creates a new member directly (no self-registration flow)
 */
exports.createMember = async (req, res, next) => {
  try {
    const { full_name, email, phone, id_number, role = 'member', nok_name, nok_relationship, nok_phone } = req.body;

    await withTransaction(async (client) => {
      const { rows: countRows } = await client.query(`SELECT COUNT(*) FROM users WHERE role = 'member'`);
      const memberNo = `MBR-${String(parseInt(countRows[0].count) + 1001).padStart(4, '0')}`;

      const tempPassword = `Umoja@${Math.random().toString(36).slice(2, 8)}`;
      const salt = await bcrypt.genSalt(12);
      const hash = await bcrypt.hash(tempPassword, salt);

      const { rows: [user] } = await client.query(
        `INSERT INTO users (id, member_no, full_name, email, password_hash, role, status)
         VALUES ($1,$2,$3,$4,$5,$6,'active') RETURNING id, member_no, full_name, email`,
        [uuidv4(), memberNo, full_name, email, hash, role]
      );

      await client.query(
        `INSERT INTO profiles (id, user_id, phone, id_number, nok_name, nok_relationship, nok_phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [uuidv4(), user.id, phone, id_number, nok_name, nok_relationship, nok_phone]
      );

      for (const type of ['savings', 'shares', 'welfare']) {
        await client.query(
          `INSERT INTO accounts (id, user_id, type, balance) VALUES ($1,$2,$3,0)`,
          [uuidv4(), user.id, type]
        );
      }

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'MEMBER_CREATE', entityType: 'user', entityId: user.id,
        description: `Member created: ${memberNo} — ${full_name}`, ip: req.ip,
      });

      res.status(201).json({
        success: true,
        message: 'Member created successfully',
        data: { ...user, member_no: memberNo, temp_password: tempPassword },
      });
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/members/:id
 */
exports.updateMember = async (req, res, next) => {
  try {
    const { full_name, status, role, phone, id_number, occupation, employer, physical_address, nok_name, nok_relationship, nok_phone, nok_id_number } = req.body;

    await withTransaction(async (client) => {
      if (full_name || status || role) {
        await client.query(
          `UPDATE users SET full_name = COALESCE($1, full_name), status = COALESCE($2, status), role = COALESCE($3, role), updated_at = NOW() WHERE id = $4`,
          [full_name, status, role, req.params.id]
        );
      }

      await client.query(
        `UPDATE profiles SET
           phone = COALESCE($1, phone), id_number = COALESCE($2, id_number),
           occupation = COALESCE($3, occupation), employer = COALESCE($4, employer),
           physical_address = COALESCE($5, physical_address),
           nok_name = COALESCE($6, nok_name), nok_relationship = COALESCE($7, nok_relationship),
           nok_phone = COALESCE($8, nok_phone), nok_id_number = COALESCE($9, nok_id_number),
           updated_at = NOW()
         WHERE user_id = $10`,
        [phone, id_number, occupation, employer, physical_address, nok_name, nok_relationship, nok_phone, nok_id_number, req.params.id]
      );

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'MEMBER_UPDATE', entityType: 'user', entityId: req.params.id,
        description: `Member profile updated`, ip: req.ip, newValues: req.body,
      });
    });

    res.json({ success: true, message: 'Member updated successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/members/:id/kyc
 * Verify or reject KYC
 */
exports.updateKyc = async (req, res, next) => {
  try {
    const { kyc_status } = req.body; // 'verified' | 'rejected'

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE profiles SET kyc_status = $1, kyc_verified_at = NOW(), kyc_verified_by = $2, updated_at = NOW() WHERE user_id = $3`,
        [kyc_status, req.user.id, req.params.id]
      );

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'KYC_UPDATE', entityType: 'user', entityId: req.params.id,
        description: `KYC status set to '${kyc_status}'`, ip: req.ip,
      });
    });

    res.json({ success: true, message: `KYC ${kyc_status}` });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/members/:id/statement
 * Mini statement — last N transactions across all accounts
 */
exports.getStatement = async (req, res, next) => {
  try {
    const { limit = 50, from, to } = req.query;
    const params = [req.params.id, parseInt(limit)];
    let dateFilter = '';
    if (from) { params.push(from); dateFilter += ` AND t.transaction_date >= $${params.length}`; }
    if (to) { params.push(to); dateFilter += ` AND t.transaction_date <= $${params.length}`; }

    const { rows } = await query(
      `SELECT t.*, a.type AS account_type FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.user_id = $1 ${dateFilter}
       ORDER BY t.created_at DESC LIMIT $2`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};
