/**
 * UmojaSACCO — Express Server Entry Point
 * Updated (003): activity log, groups/permissions, NOK, factory reset
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { connectDB } = require('./src/config/db');
const logger = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');

const authRoutes         = require('./src/routes/auth');
const memberRoutes       = require('./src/routes/members');
const nokRoutes          = require('./src/routes/nok');
const accountRoutes      = require('./src/routes/accounts');
const transactionRoutes  = require('./src/routes/transactions');
const loanRoutes         = require('./src/routes/loans');
const repaymentRoutes    = require('./src/routes/repayments');
const welfareRoutes      = require('./src/routes/welfare');
const penaltyRoutes      = require('./src/routes/penalties');
const settingsRoutes     = require('./src/routes/settings');
const reportRoutes       = require('./src/routes/reports');
const auditRoutes        = require('./src/routes/audit');
const dashboardRoutes    = require('./src/routes/dashboard');
const notificationRoutes = require('./src/routes/notifications');
const projectRoutes      = require('./src/routes/projects');
const importRoutes       = require('./src/routes/imports');
// NEW (003)
const groupRoutes        = require('./src/routes/groups');
const activityRoutes     = require('./src/routes/activity');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = rawOrigins.some(o =>
      o === origin || (o.includes('vercel.app') && origin.endsWith('.vercel.app'))
    );
    if (allowed) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true, legacyHeaders: false,
});
app.use('/api/', limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many login attempts.' } });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

const importLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 50,
  message: { success: false, message: 'Too many import requests.' } });
app.use('/api/imports', importLimiter);

app.use(compression());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use('/uploads', express.static('uploads'));

app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'UmojaSACCO API', timestamp: new Date().toISOString() })
);

// Routes
app.use('/api/auth',          authRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/members',       memberRoutes);
app.use('/api/members',       nokRoutes);      // NOK sub-routes (/:id/nok)
app.use('/api/accounts',      accountRoutes);
app.use('/api/transactions',  transactionRoutes);
app.use('/api/loans',         loanRoutes);
app.use('/api/repayments',    repaymentRoutes);
app.use('/api/welfare',       welfareRoutes);
app.use('/api/penalties',     penaltyRoutes);
app.use('/api/settings',      settingsRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/audit',         auditRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/projects',      projectRoutes);
app.use('/api/imports',       importRoutes);
// NEW
app.use('/api/groups',        groupRoutes);
app.use('/api/activity',      activityRoutes);

app.use((req, res) =>
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` })
);
app.use(errorHandler);

async function startServer() {
  try {
    await connectDB();
    logger.info('✅ Database connected');
    app.listen(PORT, () =>
      logger.info(`🚀 UmojaSACCO API running on port ${PORT} [${process.env.NODE_ENV}]`)
    );
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
module.exports = app;
