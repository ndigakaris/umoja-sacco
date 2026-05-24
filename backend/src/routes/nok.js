/**
 * backend/src/routes/nok.js
 * Next of Kin — up to 5 per member
 * Only name + relationship are mandatory
 *
 * GET    /api/members/:id/nok         — list NOKs for member
 * POST   /api/members/:id/nok         — add NOK
 * PATCH  /api/members/:id/nok/:nokId  — update NOK
 * DELETE /api/members/:id/nok/:nokId  — remove NOK
 * PUT    /api/members/:id/nok         — replace all NOKs (full upsert)
 */

const express = require('express');
const router  = express.Router({ mergeParams: true });
const { authenticate, authorize } = require('../middleware/auth');
const { query, withTransaction } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { v4: uuidv4 } = require('uuid');

const MAX_NOK = 5;

/* GET /api/members/:id/nok */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const targetId = req.params.id === 'me' ? req.user.id : req.params.id;
    if (req.user.role === 'member' && req.user.id !== targetId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const { rows } = await query(
      'SELECT * FROM member_nok WHERE user_id = $1 ORDER BY sort_order ASC',
      [targetId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/* POST /api/members/:id/nok — add one NOK */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const { nok_name, relationship, phone, id_number } = req.body;

    if (!nok_name?.trim()) return res.status(400).json({ success: false, message: 'nok_name is required' });
    if (!relationship?.trim()) return res.status(400).json({ success: false, message: 'relationship is required' });

    const { rows: existing } = await query(
      'SELECT COUNT(*) AS cnt FROM member_nok WHERE user_id = $1', [targetId]
    );
    if (parseInt(existing[0].cnt) >= MAX_NOK) {
      return res.status(400).json({ success: false, message: `Maximum ${MAX_NOK} next of kin allowed` });
    }

    const { rows: [maxOrd] } = await query(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_ord FROM member_nok WHERE user_id = $1', [targetId]
    );

    const { rows: [nok] } = await query(
      `INSERT INTO member_nok (id, user_id, sort_order, nok_name, relationship, phone, id_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [uuidv4(), targetId, maxOrd.max_ord + 1, nok_name.trim(), relationship.trim(), phone || null, id_number || null]
    );

    res.status(201).json({ success: true, data: nok });
  } catch (err) { next(err); }
});

/* PATCH /api/members/:id/nok/:nokId */
router.patch('/:nokId', authenticate, async (req, res, next) => {
  try {
    const { nok_name, relationship, phone, id_number } = req.body;

    const { rows: [nok] } = await query(
      `UPDATE member_nok
       SET nok_name    = COALESCE($1, nok_name),
           relationship = COALESCE($2, relationship),
           phone       = COALESCE($3, phone),
           id_number   = COALESCE($4, id_number),
           updated_at  = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [nok_name, relationship, phone, id_number, req.params.nokId, req.params.id]
    );

    if (!nok) return res.status(404).json({ success: false, message: 'NOK not found' });
    res.json({ success: true, data: nok });
  } catch (err) { next(err); }
});

/* DELETE /api/members/:id/nok/:nokId */
router.delete('/:nokId', authenticate, async (req, res, next) => {
  try {
    // Cannot delete primary NOK (sort_order=1) if it's the only one
    const { rows: [nok] } = await query(
      'SELECT * FROM member_nok WHERE id = $1 AND user_id = $2',
      [req.params.nokId, req.params.id]
    );
    if (!nok) return res.status(404).json({ success: false, message: 'NOK not found' });

    await query('DELETE FROM member_nok WHERE id = $1', [req.params.nokId]);

    // Renumber sort_order
    const { rows: remaining } = await query(
      'SELECT id FROM member_nok WHERE user_id = $1 ORDER BY sort_order ASC',
      [req.params.id]
    );
    for (let i = 0; i < remaining.length; i++) {
      await query('UPDATE member_nok SET sort_order = $1 WHERE id = $2', [i + 1, remaining[i].id]);
    }

    res.json({ success: true, message: 'NOK removed' });
  } catch (err) { next(err); }
});

/* PUT /api/members/:id/nok — replace all NOKs */
router.put('/', authenticate, async (req, res, next) => {
  try {
    const { noks } = req.body; // array of { nok_name, relationship, phone, id_number }
    if (!Array.isArray(noks)) return res.status(400).json({ success: false, message: 'noks must be an array' });
    if (noks.length > MAX_NOK) return res.status(400).json({ success: false, message: `Maximum ${MAX_NOK} NOKs` });

    const targetId = req.params.id;

    await withTransaction(async (client) => {
      await client.query('DELETE FROM member_nok WHERE user_id = $1', [targetId]);
      for (let i = 0; i < noks.length; i++) {
        const n = noks[i];
        if (!n.nok_name?.trim() || !n.relationship?.trim()) continue;
        await client.query(
          `INSERT INTO member_nok (id, user_id, sort_order, nok_name, relationship, phone, id_number)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [uuidv4(), targetId, i + 1, n.nok_name.trim(), n.relationship.trim(), n.phone || null, n.id_number || null]
        );
      }

      await logAudit(client, {
        actorId: req.user.id, actorName: req.user.full_name, actorRole: req.user.role,
        action: 'NOK_UPDATE', entityType: 'user', entityId: targetId,
        description: `NOKs updated: ${noks.length} entries`, ip: req.ip,
      });
    });

    const { rows } = await query(
      'SELECT * FROM member_nok WHERE user_id = $1 ORDER BY sort_order ASC', [targetId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
