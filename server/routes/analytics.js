const express = require('express');
const db = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// GET /api/analytics/herd-summary
router.get('/herd-summary', async (req, res, next) => {
  try {
    const rows = await db('cows')
      .whereNull('deleted_at')
      .select('status')
      .count('* as count')
      .groupBy('status');

    const total = rows.reduce((sum, r) => sum + r.count, 0);
    res.json({ total, by_status: rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/unhealthiest — placeholder until health tables exist
router.get('/unhealthiest', async (_req, res, next) => {
  try {
    // TODO: Implement when health_events table is added
    res.json([]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
