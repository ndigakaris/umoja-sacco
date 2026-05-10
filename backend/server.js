/**
 * UmojaSACCO — Express Server Entry Point
 * Bootstraps middleware, routes, and DB connection
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

// Route imports
const authRoutes = require('./src/routes/auth');
const memberRoutes = require('./src/routes/members');
const accountRoutes = require('./src/routes/accounts');
const transactionRoutes = require('./src/routes/transactions');
const loanRoutes = require('./src/routes/loans');
const repaymentRoutes = require('./src/routes/repayments');
const welfareRoutes = require('./src/routes/welfare');
const penaltyRoutes = require('./src/routes/penalties');
const reportRoutes = require('./src/routes/reports');
const auditRoutes = require('./src/routes/audit');
const dashboardRoutes = require('./src/routes/dashboard');
const notificationRoutes = require('./src/routes/notifications');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Security Middleware ───────────────────────────────────────────────────
app.use(helmet());
// Support comma-separated list of allowed origins (e.g. "https://umoja.vercel.app,http://localhost:3000")
const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, Render health checks)
    if (!origin) return callback(null, true);
    const allowed = rawOrigins.some(o =>
      o === origin ||
      // Allow all Vercel preview deployments for the same project
      (o.includes('vercel.app') && origin.endsWith('.vercel.app'))
    );
    if (allowed) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Global Rate Limiter ───────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ─── General Middleware ────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Serve uploaded files (profile photos etc.)
app.use('/uploads', express.static('uploads'));

// ─── Health Check ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'UmojaSACCO API', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/repayments', repaymentRoutes);
app.use('/api/welfare', welfareRoutes);
app.use('/api/penalties', penaltyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/notifications', notificationRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────
async function startServer() {
  try {
    await connectDB();
    logger.info('✅ Database connected');

    app.listen(PORT, () => {
      logger.info(`🚀 UmojaSACCO API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app; // For testing
