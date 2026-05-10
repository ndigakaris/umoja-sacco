/**
 * PostgreSQL connection pool using node-postgres (pg)
 * All DB queries go through this pool — never create raw connections elsewhere
 */

const { Pool } = require('pg');
const logger = require('../utils/logger');

// Support Neon / Render DATABASE_URL connection string, or fall back to individual vars
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: false }, // always required for Neon
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'umoja_sacco',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(poolConfig);

// Log pool errors (don't crash the app)
pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Test the connection on startup
 */
async function connectDB() {
  const client = await pool.connect();
  const result = await client.query('SELECT NOW()');
  client.release();
  logger.info(`PostgreSQL connected — server time: ${result.rows[0].now}`);
  return result;
}

/**
 * Convenience query wrapper — always use this for single queries
 * @param {string} text  SQL query string
 * @param {Array}  params  Parameterized values
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`Query executed in ${duration}ms: ${text.substring(0, 80)}`);
    }
    return res;
  } catch (err) {
    logger.error(`Query error: ${text.substring(0, 80)}`, err);
    throw err;
  }
}

/**
 * Transaction wrapper — use for multi-step DB operations (e.g. loan disbursement)
 * Automatically commits or rolls back
 * @param {Function} callback  Async function receiving the client
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, connectDB, withTransaction };
