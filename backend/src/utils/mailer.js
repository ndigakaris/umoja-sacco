/**
 * Email utility using Nodemailer
 * Configure SMTP settings in .env
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send an email
 * @param {Object} options - { to, subject, html, text }
 */
async function sendEmail({ to, subject, html, text }) {
  if (!process.env.SMTP_USER) return; // Not configured

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"UmojaSACCO" <noreply@umojasacco.co.ke>',
      to, subject, html, text,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
    // Don't throw — email failure shouldn't break the request
  }
}

/**
 * Send loan status notification email
 */
async function sendLoanStatusEmail(email, name, loanRef, status, amount) {
  const statusMap = {
    approved: { subject: 'Loan Application Approved ✅', color: '#00A878' },
    rejected: { subject: 'Loan Application Update', color: '#EF4444' },
    active: { subject: 'Loan Disbursed — Funds Available 💰', color: '#0F4C81' },
  };
  const s = statusMap[status] || { subject: 'Loan Update', color: '#0F4C81' };

  await sendEmail({
    to: email,
    subject: s.subject,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: ${s.color}; color: white; padding: 20px 24px; border-radius: 10px 10px 0 0;">
          <h2 style="margin:0;">UmojaSACCO</h2>
        </div>
        <div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 10px 10px;">
          <p>Dear ${name},</p>
          <p>Your loan application <strong>${loanRef}</strong> for <strong>KES ${Number(amount).toLocaleString()}</strong> has been <strong>${status}</strong>.</p>
          <p>Log in to your member portal for details.</p>
          <p style="color: #666; font-size: 12px; margin-top: 24px;">UmojaSACCO Society Ltd | SASRA Regulated</p>
        </div>
      </div>
    `,
  });
}

module.exports = { sendEmail, sendLoanStatusEmail };
