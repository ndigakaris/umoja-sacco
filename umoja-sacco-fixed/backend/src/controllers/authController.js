/**
 * Auth Controller — Register, Login, Refresh, Logout, Reset Password
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { sendEmail } = require('../utils/mailer');

/**
 * Generate access + refresh token pair
 */
function generateTokens(user) {
  const payload = { id: user.id, role: user.role, member_no: user.member_no };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { accessToken, refreshToken };
}

/**
 * POST /api/auth/register
 * Self-registration (creates pending member account)
 */
exports.register = async (req, res, next) => {
  try {
    const { full_name, email, password, phone, id_number } = req.body;

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    await withTransaction(async (client) => {
      // Auto-generate member number
      const { rows: countRows } = await client.query('SELECT COUNT(*) FROM users WHERE role = $1', ['member']);
      const memberNo = `MBR-${String(parseInt(countRows[0].count) + 1001).padStart(4, '0')}`;

      // Create user
      const { rows } = await client.query(
        `INSERT INTO users (id, member_no, full_name, email, password_hash, role, status)
         VALUES ($1,$2,$3,$4,$5,'member','pending') RETURNING id, member_no, full_name, email, role`,
        [uuidv4(), memberNo, full_name, email, passwordHash]
      );
      const user = rows[0];

      // Create profile
      await client.query(
        `INSERT INTO profiles (id, user_id, phone, id_number) VALUES ($1,$2,$3,$4)`,
        [uuidv4(), user.id, phone, id_number]
      );

      // Create 3 accounts (savings, shares, welfare)
      for (const type of ['savings', 'shares', 'welfare']) {
        await client.query(
          `INSERT INTO accounts (id, user_id, type, balance) VALUES ($1,$2,$3,0)`,
          [uuidv4(), user.id, type]
        );
      }

      await logAudit(client, {
        actorId: user.id, actorName: user.full_name, actorRole: 'member',
        action: 'MEMBER_REGISTER', entityType: 'user', entityId: user.id,
        description: `New member self-registered: ${memberNo} — ${full_name}`,
        ip: req.ip,
      });

      res.status(201).json({
        success: true,
        message: 'Registration successful. Your account is pending admin approval.',
        data: { member_no: memberNo, email: user.email },
      });
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { rows } = await query(
      `SELECT u.id, u.member_no, u.full_name, u.email, u.password_hash, u.role, u.status
       FROM users u WHERE u.email = $1`,
      [email.toLowerCase()]
    );

    if (!rows[0]) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = rows[0];

    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account suspended. Contact admin.' });
    }
    if (user.status === 'pending') {
      return res.status(403).json({ success: false, message: 'Account pending approval by admin.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const { accessToken, refreshToken } = generateTokens(user);

    // Store refresh token hash
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
      [uuidv4(), user.id, tokenHash, expiresAt]
    );

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    await logAudit(null, {
      actorId: user.id, actorName: user.full_name, actorRole: user.role,
      action: 'USER_LOGIN', entityType: 'user', entityId: user.id,
      description: `User logged in: ${user.email}`, ip: req.ip,
    });

    res.json({
      success: true,
      data: {
        user: { id: user.id, member_no: user.member_no, full_name: user.full_name, email: user.email, role: user.role },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/refresh
 * Rotate refresh token and issue new access token
 */
exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const { rows } = await query(
      `SELECT * FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND revoked = false AND expires_at > NOW()`,
      [tokenHash, decoded.id]
    );

    if (!rows[0]) {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }

    // Revoke old token (rotation)
    await query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [rows[0].id]);

    const { rows: userRows } = await query(
      'SELECT id, member_no, full_name, email, role, status FROM users WHERE id = $1',
      [decoded.id]
    );
    const user = userRows[0];

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)`,
      [uuidv4(), user.id, newHash, expiresAt]
    );

    res.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
    next(err);
  }
};

/**
 * POST /api/auth/logout
 */
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
exports.getMe = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.member_no, u.full_name, u.email, u.role, u.status, u.last_login,
              p.phone, p.id_number, p.photo_url, p.kyc_status
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};
