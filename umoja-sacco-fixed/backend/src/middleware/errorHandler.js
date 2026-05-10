/**
 * Global Express Error Handler
 * All errors thrown/passed via next(err) land here
 */

const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Default status & message
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';

  // PostgreSQL specific errors
  if (err.code === '23505') {
    statusCode = 409;
    message = 'A record with this information already exists';
    if (err.detail?.includes('email')) message = 'Email address already registered';
    if (err.detail?.includes('id_number')) message = 'National ID already registered';
    if (err.detail?.includes('member_no')) message = 'Member number already exists';
  }

  if (err.code === '23503') {
    statusCode = 400;
    message = 'Referenced record does not exist';
  }

  if (err.code === '23514') {
    statusCode = 400;
    message = 'Validation constraint violated';
  }

  // Log server errors
  if (statusCode >= 500) {
    logger.error({
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      body: req.body,
      user: req.user?.id,
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
