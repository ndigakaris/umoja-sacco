/**
 * UmojaSACCO — Seed Data
 * Creates realistic sample data for development/demo
 * Run with: npm run seed
 */

require('dotenv').config({ path: '../.env' });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(poolConfig);

async function seed() {
  const client = await pool.connect();
  console.log('🌱 Seeding database...');

  try {
    await client.query('BEGIN');

    // ─── Loan Products ────────────────────────────────────────────────
    const products = [
      { name: 'Development Loan', rate: 12, method: 'reducing', min: 50000, max: 2000000, min_t: 6, max_t: 60, mult: 4, gtors: 2 },
      { name: 'Emergency Loan', rate: 8, method: 'reducing', min: 10000, max: 100000, min_t: 1, max_t: 12, mult: 2, gtors: 1 },
      { name: 'School Fees Loan', rate: 10, method: 'reducing', min: 20000, max: 500000, min_t: 3, max_t: 24, mult: 3, gtors: 1 },
      { name: 'Business Loan', rate: 14, method: 'flat', min: 100000, max: 5000000, min_t: 12, max_t: 84, mult: 5, gtors: 2 },
    ];

    const productIds = {};
    for (const p of products) {
      const { rows } = await client.query(
        `INSERT INTO loan_products (id, name, interest_rate, interest_method, min_amount, max_amount, min_term_months, max_term_months, max_multiplier, guarantors_required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id`,
        [uuidv4(), p.name, p.rate, p.method, p.min, p.max, p.min_t, p.max_t, p.mult, p.gtors]
      );
      if (rows[0]) productIds[p.name] = rows[0].id;
    }

    // ─── Penalty Rules ────────────────────────────────────────────────
    await client.query(`
      INSERT INTO penalty_rules (type, rate, is_percent, description)
      VALUES
        ('late_repayment', 2.0, true, '2% per month on outstanding loan balance'),
        ('missed_contribution', 500, false, 'KES 500 fixed per missed monthly contribution'),
        ('rule_violation', 1000, false, 'KES 1,000 fixed for rule violations')
      ON CONFLICT (type) DO NOTHING
    `);

    // ─── SACCO Settings ───────────────────────────────────────────────
    const settings = [
      ['sacco_name', 'Umoja SACCO Society Ltd'],
      ['sacco_reg_no', 'CS/SACCO/2010/001234'],
      ['sacco_sasra_no', 'SASRA/DT/2010/0089'],
      ['monthly_contribution', '5000'],
      ['max_loan_multiplier', '4'],
      ['financial_year_end', 'December'],
      ['welfare_monthly_deduction', '500'],
      ['min_shares', '1000'],
    ];
    for (const [key, value] of settings) {
      await client.query(
        `INSERT INTO sacco_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }

    // ─── Users ────────────────────────────────────────────────────────
    const SALT = await bcrypt.genSalt(12);
    const users = [
      { no: 'ADMIN-001', name: 'James Mwangi',   email: 'admin@umojasacco.co.ke',      role: 'admin',     pw: 'Admin@1234' },
      { no: 'TREAS-001', name: 'Fatuma Hassan',  email: 'treasurer@umojasacco.co.ke',  role: 'treasurer', pw: 'Treasurer@1234' },
      { no: 'AUDIT-001', name: 'Samuel Karanja', email: 'auditor@umojasacco.co.ke',    role: 'auditor',   pw: 'Auditor@1234' },
      { no: 'MBR-2041',  name: 'Wanjiku Kamau',  email: 'wanjiku@email.com',           role: 'member',    pw: 'Member@1234' },
      { no: 'MBR-1988',  name: 'Moses Odhiambo', email: 'moses@email.com',             role: 'member',    pw: 'Member@1234' },
      { no: 'MBR-2210',  name: 'Amina Njoroge',  email: 'amina@email.com',             role: 'member',    pw: 'Member@1234' },
      { no: 'MBR-1755',  name: 'Peter Kipchoge', email: 'peter@email.com',             role: 'member',    pw: 'Member@1234' },
      { no: 'MBR-2284',  name: 'Grace Muthoni',  email: 'grace@email.com',             role: 'member',    pw: 'Member@1234' },
    ];

    const userIds = {};
    for (const u of users) {
      const hash = await bcrypt.hash(u.pw, SALT);
      const status = u.role === 'member' && u.no === 'MBR-1755' ? 'suspended' : 'active';
      const { rows } = await client.query(
        `INSERT INTO users (id, member_no, full_name, email, password_hash, role, status, email_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT (email) DO NOTHING RETURNING id`,
        [uuidv4(), u.no, u.name, u.email, hash, u.role, status]
      );
      if (rows[0]) userIds[u.no] = rows[0].id;
    }

    // ─── Profiles (KYC) ──────────────────────────────────────────────
    const profileData = [
      { no: 'MBR-2041', id_no: '24891234', phone: '+254712345678', dob: '1985-03-15', gender: 'Female', occ: 'Civil Servant', emp: 'Nairobi County', kyc: 'verified', nok_name: 'John Kamau', nok_rel: 'Spouse', nok_ph: '+254720111222' },
      { no: 'MBR-1988', id_no: '31200567', phone: '+254722888001', dob: '1979-07-22', gender: 'Male', occ: 'Teacher', emp: 'Ministry of Education', kyc: 'verified', nok_name: 'Jane Odhiambo', nok_rel: 'Spouse', nok_ph: '+254733999000' },
      { no: 'MBR-2210', id_no: '19876543', phone: '+254700123456', dob: '1992-11-08', gender: 'Female', occ: 'Nurse', emp: 'KNH', kyc: 'pending', nok_name: 'Ali Njoroge', nok_rel: 'Brother', nok_ph: '+254711444555' },
      { no: 'MBR-1755', id_no: '28451290', phone: '+254733557889', dob: '1976-05-30', gender: 'Male', occ: 'Runner', emp: 'Self Employed', kyc: 'verified', nok_name: 'Mary Kipchoge', nok_rel: 'Spouse', nok_ph: '+254722888333' },
      { no: 'MBR-2284', id_no: '37654321', phone: '+254711001234', dob: '1995-09-14', gender: 'Female', occ: 'Accountant', emp: 'Private Sector', kyc: 'pending', nok_name: 'David Muthoni', nok_rel: 'Father', nok_ph: '+254700567890' },
    ];

    for (const p of profileData) {
      const uid = userIds[p.no];
      if (!uid) continue;
      await client.query(
        `INSERT INTO profiles (id, user_id, id_number, phone, date_of_birth, gender, occupation, employer, kyc_status, nok_name, nok_relationship, nok_phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (user_id) DO NOTHING`,
        [uuidv4(), uid, p.id_no, p.phone, p.dob, p.gender, p.occ, p.emp, p.kyc, p.nok_name, p.nok_rel, p.nok_ph]
      );
    }

    // ─── Accounts ─────────────────────────────────────────────────────
    const memberAccounts = [
      { no: 'MBR-2041', sav: 84500,  sha: 42000, wel: 12800 },
      { no: 'MBR-1988', sav: 210000, sha: 85000, wel: 28500 },
      { no: 'MBR-2210', sav: 56200,  sha: 18000, wel: 8400 },
      { no: 'MBR-1755', sav: 173000, sha: 62000, wel: 21500 },
      { no: 'MBR-2284', sav: 5000,   sha: 1000,  wel: 500 },
    ];

    const accountIds = {};
    for (const a of memberAccounts) {
      const uid = userIds[a.no];
      if (!uid) continue;
      accountIds[a.no] = {};
      for (const [type, bal] of [['savings', a.sav], ['shares', a.sha], ['welfare', a.wel]]) {
        const { rows } = await client.query(
          `INSERT INTO accounts (id, user_id, type, balance) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, type) DO NOTHING RETURNING id`,
          [uuidv4(), uid, type, bal]
        );
        if (rows[0]) accountIds[a.no][type] = rows[0].id;
      }
    }

    // ─── Sample Loans ─────────────────────────────────────────────────
    const adminId = userIds['ADMIN-001'];
    const treasurerId = userIds['TREAS-001'];
    const loanData = [
      { no: 'MBR-2041', ref: 'LN-2041-01', prod: 'Development Loan', principal: 250000, term: 24, status: 'active', outstanding: 250000 },
      { no: 'MBR-1988', ref: 'LN-1988-04', prod: 'Development Loan', principal: 500000, term: 36, status: 'active', outstanding: 500000 },
      { no: 'MBR-1755', ref: 'LN-1755-02', prod: 'School Fees Loan', principal: 75000, term: 12, status: 'active', outstanding: 52300 },
      { no: 'MBR-2210', ref: 'LN-2210-01', prod: 'Emergency Loan',   principal: 30000, term: 6,  status: 'active', outstanding: 18200 },
    ];

    for (const l of loanData) {
      const uid = userIds[l.no];
      const pid = productIds[l.prod];
      if (!uid) continue;
      const rate = l.prod === 'School Fees Loan' ? 10 : l.prod === 'Emergency Loan' ? 8 : 12;
      const r = rate / 100 / 12;
      const n = l.term;
      const monthly = l.principal * (r * Math.pow(1+r,n)) / (Math.pow(1+r,n) - 1);
      await client.query(
        `INSERT INTO loans (id, reference, user_id, product_id, principal, interest_rate, interest_method, term_months, monthly_payment, outstanding, status, disbursed_at, disbursed_by, application_date)
         VALUES ($1,$2,$3,$4,$5,$6,'reducing',$7,$8,$9,$10,NOW(),$11,CURRENT_DATE) ON CONFLICT DO NOTHING`,
        [uuidv4(), l.ref, uid, pid, l.principal, rate, n, Math.round(monthly * 100)/100, l.outstanding, l.status, treasurerId]
      );
    }

    // ─── Sample Welfare Cases ─────────────────────────────────────────
    const welfareData = [
      { no: 'MBR-2041', ref: 'WF-088', cat: 'bereavement', amt: 30000, status: 'pending' },
      { no: 'MBR-2210', ref: 'WF-089', cat: 'illness',     amt: 15000, status: 'pending' },
      { no: 'MBR-1755', ref: 'WF-090', cat: 'emergency',   amt: 50000, status: 'pending' },
      { no: 'MBR-1988', ref: 'WF-071', cat: 'bereavement', amt: 30000, status: 'disbursed' },
    ];

    for (const w of welfareData) {
      const uid = userIds[w.no];
      if (!uid) continue;
      await client.query(
        `INSERT INTO welfare_cases (id, reference, user_id, category, amount, status, filed_date)
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE) ON CONFLICT DO NOTHING`,
        [uuidv4(), w.ref, uid, w.cat, w.amt, w.status]
      );
    }

    // ─── Sample Penalties ─────────────────────────────────────────────
    const penaltyData = [
      { no: 'MBR-1755', ref: 'PEN-001', type: 'late_repayment',      amt: 3500,  status: 'pending' },
      { no: 'MBR-2284', ref: 'PEN-002', type: 'missed_contribution',  amt: 500,   status: 'pending' },
      { no: 'MBR-2210', ref: 'PEN-003', type: 'missed_contribution',  amt: 500,   status: 'paid' },
    ];

    for (const p of penaltyData) {
      const uid = userIds[p.no];
      if (!uid) continue;
      await client.query(
        `INSERT INTO penalties (id, reference, user_id, type, amount, status, period_date)
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE) ON CONFLICT DO NOTHING`,
        [uuidv4(), p.ref, uid, p.type, p.amt, p.status]
      );
    }

    // ─── Sample Audit Logs ────────────────────────────────────────────
    const auditData = [
      { actor: 'TREAS-001', action: 'LOAN_DISBURSE',    entity: 'loan',   desc: 'Loan LN-1988-04 KES 500,000 disbursed to Moses Odhiambo' },
      { actor: 'ADMIN-001', action: 'MEMBER_CREATE',    entity: 'member', desc: 'New member MBR-2284 Grace Muthoni created' },
      { actor: 'ADMIN-001', action: 'WELFARE_APPROVE',  entity: 'welfare',desc: 'Welfare WF-088 Bereavement KES 30,000 approved' },
      { actor: 'ADMIN-001', action: 'LOAN_APPROVE',     entity: 'loan',   desc: 'Loan LN-1988-04 approved by Admin' },
    ];

    for (const a of auditData) {
      const actor = userIds[a.actor];
      const actorName = users.find(u => u.no === a.actor)?.name || 'System';
      await client.query(
        `INSERT INTO audit_logs (id, actor_id, actor_name, action, entity_type, description, ip_address, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'41.90.12.44', NOW() - INTERVAL '${Math.floor(Math.random()*48)} hours')`,
        [uuidv4(), actor, actorName, a.action, a.entity, a.desc]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Seeding complete!');
    console.log('\nDefault Credentials:');
    console.log('  Admin:     admin@umojasacco.co.ke / Admin@1234');
    console.log('  Treasurer: treasurer@umojasacco.co.ke / Treasurer@1234');
    console.log('  Auditor:   auditor@umojasacco.co.ke / Auditor@1234');
    console.log('  Member:    member@umojasacco.co.ke / Member@1234');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
