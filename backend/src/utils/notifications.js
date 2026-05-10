/**
 * Notification Utility — in-app + email + SMS
 */

const { query } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('./mailer');

/**
 * Create an in-app notification (always runs inside a transaction)
 */
async function createNotification(client, { userId, title, message, type, relatedId }) {
  const db = client || { query: (...args) => query(...args) };
  await db.query(
    `INSERT INTO notifications (id, user_id, title, message, type, related_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [uuidv4(), userId, title, message, type, relatedId || null]
  );
}

/**
 * Send SMS via Africa's Talking (optional — falls back silently if not configured)
 */
async function sendSMS(phone, message) {
  if (!process.env.AT_API_KEY || process.env.AT_API_KEY === 'your_africastalking_api_key') {
    return; // Not configured, skip silently
  }
  try {
    const AfricasTalking = require('africastalking');
    const at = AfricasTalking({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME });
    await at.SMS.send({ to: [phone], message, from: process.env.AT_SENDER_ID });
  } catch (err) {
    console.error('SMS send failed:', err.message);
  }
}

module.exports = { createNotification, sendSMS };
