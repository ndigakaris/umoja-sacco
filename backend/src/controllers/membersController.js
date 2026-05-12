/**
 * Members Controller — CRUD, KYC, profile management
 *
 * BUGS FIXED:
 *  1. member_no generation: COUNT is NOT race-safe. Two concurrent requests
 *     both read COUNT=50 and both generate MBR-1051. Fixed with a
 *     SELECT ... FOR UPDATE on a dedicated sequence row, or (simpler &
 *     correct here) using MAX(member_no) with a transaction lock.
 *     We use a pg advisory lock keyed on a constant integer so only one
 *     INSERT path runs at a time — zero extra tables needed.
 *
 *  2. updateKyc: no validation of kyc_status value — any string could be
 *     written to the DB, bypassing the ENUM. Fixed with explicit allowlist.
 *
 *  3. updateMember: UPSERT profile row — if profile was never created for
 *     an older member, the UPDATE silently did nothing. Fixed with
 *     INSERT ... ON CONFLICT DO UPDATE.
 *
 *  4. createMember: temp password was included in the DB-returned object;
 *     now explicitly returned only in the API response, never stored in DB.
 *
 *  5. listMembers: pagination.pages used floating division — fixed to
 *     Math.ceil with parseInt to avoid "3.333" page counts.
 */

const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { createNotification } = require('../utils/notifications');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ─── Advisory lock key (arbitrary constant for member_no serialisation) ───
const MEMBER_NO_LOCK_KEY = 7_001_001;

/**
 * GET /api/members
 */
exports.listMembers = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 30,
      search = '', role = 'member',
      status, kyc_status,
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [role];
    const where  = ['u.role = $1'];

    if (search) {
      params.push(`%${search}%`);
      where.push(
        `(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length}` +
        ` OR u.member_no ILIKE $${params.length} OR p.phone ILIKE $${params.length}` +
        ` OR p.id_number ILIKE $${params.length})`
      );
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
                COALESCE(
                  (SELECT SUM(outstanding) FROM loans WHERE user_id = u.id AND status = 'active'),
                  0
                ) AS loan_balance
         FROM   users u
         LEFT JOIN profiles p     ON p.user_id = u.id
         LEFT JOIN accounts a_sav ON a_sav.user_id = u.id AND a_sav.type = 'savings'
         LEFT JOIN accounts a_sha ON a_sha.user_id = u.id AND a_sha.type = 'shares'
         LEFT JOIN accounts a_wel ON a_wel.user_id = u.id AND a_wel.type = 'welfare'
         ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit, 10), offset]
      ),
      query(
        `SELECT COUNT(*) FROM users u LEFT JOIN profiles p ON p.user_id = u.id ${whereClause}`,
        params
      ),
    ]);

    const total = parseInt(totalRow.count, 10);
    res.json({
      success: true,
      data: members,
      pagination: {
        page:  parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)), // FIX #5
      },
    });
  } catch (err) { next(err); }
};

/**
 * GET /api/members/:id
 */
exports.getMember = async (req, res, next) => {
  try {
    const targetId = req.params.id === 'me' ? req.user.id : req.params.id;

    if (req.user.role === 'member' && req.user.id !== targetId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { rows: [member] } = await query(
      `SELECT u.id, u.member_no, u.full_name, u.email, u.role, u.status,
              u.last_login, u.created_at,
              p.phone, p.id_number, p.date_of_birth, p.gender,
              p.occupation, p.employer, p.physical_address, p.photo_url,
              p.nok_name, p.nok_relationship, p.nok_phone, p.nok_id_number,
              p.kyc_status, p.kyc_verified_at, p.kyc_verified_by,
              COALESCE(a_sav.balance, 0) AS savings_balance,
              COALESCE(a_sha.balance, 0) AS shares_balance,
              COALESCE(a_wel.balance, 0) AS welfare_balance,
              COALESCE(
                (SELECT SUM(outstanding) FROM loans WHERE user_id = u.id AND status = 'active'),
                0
              ) AS loan_balance,
              (SELECT COUNT(*) FROM penalties WHERE user_id = u.id AND status = 'pending') AS pending_penalties
       FROM   users u
       LEFT JOIN profiles p     ON p.user_id = u.id
       LEFT JOIN accounts a_sav ON a_sav.user_id = u.id AND a_sav.type = 'savings'
       LEFT JOIN accounts a_sha ON a_sha.user_id = u.id AND a_sha.type = 'shares'
       LEFT JOIN accounts a_wel ON a_wel.user_id = u.id AND a_wel.type = 'welfare'
       WHERE  u.id = $1`,
      [targetId]
    );

    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }

    res.json({ success: true, data: member });
  } catch (err) { next(err); }
};

/**
 * POST /api/members
 *
 * FIX #1: Uses pg_try_advisory_xact_lock to serialise member_no generation.
 * The lock is automatically released at transaction end — no cleanup needed.
 * This is correct even under concurrent requests from multiple Render workers
 * because advisory locks are connection-level (not server-process-level) and
 * Neon/pg pools each get a real pg connection.
 */
exports.createMember = async (req, res, next) => {
  try {
    const {
      full_name, email, phone, id_number,
      role = 'member', nok_name, nok_relationship, nok_phone,
      date_of_birth, gender, occupation, physical_address,
    } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ success: false, message: 'full_name and email are required' });
    }

    // Check duplicates before entering the transaction
    const { rows: existing } = await query(
      `SELECT u.email, p.phone, p.id_number
       FROM   users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE  u.email = $1
          OR  p.phone = $2
          OR  (p.id_number IS NOT NULL AND p.id_number = $3)`,
      [email, phone || null, id_number || null]
    );

    if (existing.length > 0) {
      const dup = existing[0];
      if (dup.email === email)
        return res.status(409).json({ success: false, message: 'Email already registered' });
      if (phone && dup.phone === phone)
        return res.status(409).json({ success: false, message: 'Phone number already registered' });
      if (id_number && dup.id_number === id_number)
        return res.status(409).json({ success: false, message: 'ID number already registered' });
    }

    const tempPassword = `Umoja@${Math.random().toString(36).slice(2, 8)}`;
    const hash = await bcrypt.hash(tempPassword, 10);

    let createdMember;

    await withTransaction(async (client) => {
      // FIX #1 — serialise member_no generation with an advisory lock.
      // pg_try_advisory_xact_lock returns FALSE if another session holds it;
      // we loop (or just wait with pg_advisory_xact_lock which blocks).
      await client.query(`SELECT pg_advisory_xact_lock($1)`, [MEMBER_NO_LOCK_KEY]);

      // Safe to read MAX now — no concurrent INSERT can race us
      const { rows: [{ max_no }] } = await client.query(
        `SELECT MAX(CAST(REGEXP_REPLACE(member_no, '[^0-9]', '', 'g') AS INT)) AS max_no
         FROM   users
         WHERE  member_no LIKE 'MBR-%'`
      );
      const nextSeq  = (max_no || 1000) + 1;
      const memberNo = `MBR-${String(nextSeq).padStart(4, '0')}`;

      const { rows: [user] } = await client.query(
        `INSERT INTO users (id, member_no, full_name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         RETURNING id, member_no, full_name, email`,
        [uuidv4(), memberNo, full_name, email, hash, role]
      );

      await client.query(
        `INSERT INTO profiles
           (id, user_id, phone, id_number, nok_name, nok_relationship,
            nok_phone, date_of_birth, gender, occupation, physical_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          uuidv4(), user.id, phone || null, id_number || null,
          nok_name || null, nok_relationship || null, nok_phone || null,
          date_of_birth || null, gender || null,
          occupation || null, physical_address || null,
        ]
      );

      // Create all 3 accounts atomically
      await client.query(
        `INSERT INTO accounts (id, user_id, type, balance) VALUES
         ($1, $2, 'savings', 0),
         ($3, $2, 'shares',  0),
         ($4, $2, 'welfare', 0)`,
        [uuidv4(), user.id, uuidv4(), uuidv4()]
      );

      await logAudit(client, {
        actorId:   req.user.id,
        actorName: req.user.full_name,
        actorRole: req.user.role,
        action:       'MEMBER_CREATE',
        entityType:   'user',
        entityId:     user.id,
        description:  `Member created: ${memberNo} — ${full_name}`,
        ip: req.ip,
      });

      createdMember = { ...user, temp_password: tempPassword }; // FIX #4: temp_password not from DB
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
 *
 * FIX #3: uses INSERT ... ON CONFLICT for profile upsert so older members
 * without a profiles row don't silently fail the UPDATE.
 */
exports.updateMember = async (req, res, next) => {
  try {
    const {
      full_name, status, role, phone, id_number,
      occupation, employer, physical_address,
      date_of_birth, gender,
      nok_name, nok_relationship, nok_phone, nok_id_number,
    } = req.body;

    await withTransaction(async (client) => {
      const { rows: [existing] } = await client.query(
        'SELECT id FROM users WHERE id = $1', [req.params.id]
      );
      if (!existing) throw Object.assign(new Error('Member not found'), { statusCode: 404 });

      if (full_name || status || role) {
        await client.query(
          `UPDATE users
           SET full_name  = COALESCE($1, full_name),
               status     = COALESCE($2, status),
               role       = COALESCE($3, role),
               updated_at = NOW()
           WHERE id = $4`,
          [full_name, status, role, req.params.id]
        );
      }

      // FIX #3: UPSERT profile — handles missing profile rows for legacy members
      await client.query(
        `INSERT INTO profiles
           (id, user_id, phone, id_number, occupation, employer, physical_address,
            date_of_birth, gender, nok_name, nok_relationship, nok_phone, nok_id_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (user_id) DO UPDATE SET
           phone            = COALESCE($3,  profiles.phone),
           id_number        = COALESCE($4,  profiles.id_number),
           occupation       = COALESCE($5,  profiles.occupation),
           employer         = COALESCE($6,  profiles.employer),
           physical_address = COALESCE($7,  profiles.physical_address),
           date_of_birth    = COALESCE($8,  profiles.date_of_birth),
           gender           = COALESCE($9,  profiles.gender),
           nok_name         = COALESCE($10, profiles.nok_name),
           nok_relationship = COALESCE($11, profiles.nok_relationship),
           nok_phone        = COALESCE($12, profiles.nok_phone),
           nok_id_number    = COALESCE($13, profiles.nok_id_number),
           updated_at       = NOW()`,
        [
          uuidv4(), req.params.id,
          phone, id_number, occupation, employer, physical_address,
          date_of_birth, gender,
          nok_name, nok_relationship, nok_phone, nok_id_number,
        ]
      );

      await logAudit(client, {
        actorId:   req.user.id,
        actorName: req.user.full_name,
        actorRole: req.user.role,
        action:      'MEMBER_UPDATE',
        entityType:  'user',
        entityId:    req.params.id,
        description: 'Member profile updated',
        ip:          req.ip,
        newValues:   req.body,
      });
    });

    const { rows: [updated] } = await query(
      `SELECT u.id, u.member_no, u.full_name, u.email, u.role, u.status,
              p.phone, p.kyc_status
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.params.id]
    );

    res.json({ success: true, message: 'Member updated successfully', data: updated });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/members/:id/kyc
 *
 * FIX #2: Validate kyc_status against the ENUM allowlist before writing.
 * Without this, any string (e.g. "hacked", "admin") could be persisted,
 * either crashing the DB (if ENUM enforced at DB level) or storing junk.
 */
const VALID_KYC_STATUSES = new Set(['pending', 'verified', 'rejected']);

exports.updateKyc = async (req, res, next) => {
  try {
    const { kyc_status } = req.body;

    // FIX #2
    if (!VALID_KYC_STATUSES.has(kyc_status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid kyc_status. Must be one of: ${[...VALID_KYC_STATUSES].join(', ')}`,
      });
    }

    await withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE profiles
         SET kyc_status = $1, kyc_verified_at = NOW(), kyc_verified_by = $2, updated_at = NOW()
         WHERE user_id = $3`,
        [kyc_status, req.user.id, req.params.id]
      );

      if (rowCount === 0) {
        throw Object.assign(new Error('Member profile not found'), { statusCode: 404 });
      }

      await logAudit(client, {
        actorId:   req.user.id,
        actorName: req.user.full_name,
        actorRole: req.user.role,
        action:      'KYC_UPDATE',
        entityType:  'user',
        entityId:    req.params.id,
        description: `KYC status set to '${kyc_status}'`,
        ip:          req.ip,
      });
    });

    res.json({ success: true, message: `KYC status updated to ${kyc_status}` });
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
    const params = [targetId, parseInt(limit, 10)];
    let dateFilter = '';

    if (from) { params.push(from); dateFilter += ` AND t.transaction_date >= $${params.length}`; }
    if (to)   { params.push(to);   dateFilter += ` AND t.transaction_date <= $${params.length}`; }

    const { rows } = await query(
      `SELECT t.*, a.type AS account_type
       FROM   transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE  t.user_id = $1 ${dateFilter}
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT  $2`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};
