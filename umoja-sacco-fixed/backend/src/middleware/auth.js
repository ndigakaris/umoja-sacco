/**
 * JWT Authentication & Role-Based Authorization Middleware
 */

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

/**
 * Verify JWT access token on protected routes
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch current user to ensure they're still active
    const { rows } = await query(
      'SELECT id, member_no, full_name, email, role, status FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!rows[0]) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    if (rows[0].status === 'suspended' || rows[0].status === 'inactive') {
      return res.status(403).json({ success: false, message: 'Account suspended or inactive' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Access token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid access token' });
  }
};

/**
 * Role-based authorization factory
 * Usage: authorize('admin', 'treasurer')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Required roles: ${roles.join(', ')}`
    });
  }
  next();
};

/**
 * Allows member to access only their own data, unless admin/treasurer
 */
const authorizeOwnerOrAdmin = (paramKey = 'userId') => (req, res, next) => {
  const targetId = req.params[paramKey];
  const isAdmin = ['admin', 'treasurer', 'auditor'].includes(req.user.role);
  const isOwner = req.user.id === targetId;

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};

module.exports = { authenticate, authorize, authorizeOwnerOrAdmin };
