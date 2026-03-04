const express = require('express');
const Joi = require('joi');
const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { requireAdmin } = require('../middleware/authorize');
const { logAudit } = require('../services/auditService');

const router = express.Router();
router.use(auth);

// --- Validation schemas ---

const cowSchema = Joi.object({
  tag_number: Joi.string().max(50).required(),
  name: Joi.string().max(100).allow('', null),
  dob: Joi.string().allow('', null),
  breed: Joi.string().max(100).allow('', null),
  breed_type_id: Joi.string().max(36).allow(null, ''),
  sex: Joi.string().valid('female', 'male').default('female'),
  status: Joi.string().valid('active', 'dry', 'pregnant', 'sick', 'sold', 'dead').default('active'),
  sire_id: Joi.string().uuid().allow(null),
  dam_id: Joi.string().uuid().allow(null),
  is_external: Joi.boolean().default(false),
  purpose: Joi.string().valid('natural_service', 'ai_semen_donor', 'both').allow(null, ''),
  life_phase_override: Joi.string().valid('calf', 'heifer', 'cow', 'young_bull', 'bull').allow(null, ''),
  is_dry: Joi.boolean().default(false),
  notes: Joi.string().max(2000).allow('', null)
});

const cowUpdateSchema = cowSchema.fork('tag_number', (s) => s.optional());

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const cowQuerySchema = Joi.object({
  search: Joi.string().max(100).allow(''),
  status: Joi.string().valid('active', 'dry', 'pregnant', 'sick', 'sold', 'dead'),
  sex: Joi.string().valid('female', 'male'),
  breed_type_id: Joi.string().max(36),
  is_dry: Joi.string().valid('0', '1', 'true', 'false'),
  life_phase: Joi.string().valid('calf', 'heifer', 'cow', 'young_bull', 'bull'),
  pregnant: Joi.string().valid('0', '1', 'true', 'false'),
  dim_min: Joi.number().integer().min(0),
  dim_max: Joi.number().integer().min(0),
  calving_after: Joi.string().pattern(ISO_DATE_RE),
  calving_before: Joi.string().pattern(ISO_DATE_RE),
  yield_min: Joi.number().min(0),
  yield_max: Joi.number().min(0),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
  sort: Joi.string().valid('tag_number', 'name', 'dob', 'status'),
  order: Joi.string().valid('asc', 'desc'),
});

const MAX_SEARCH_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// --- Helpers ---

async function findCowOrFail(id) {
  const cow = await db('cows').where({ id }).whereNull('deleted_at').first();
  if (!cow) {
    const err = new Error('Cow not found');
    err.status = 404;
    throw err;
  }
  return cow;
}

// --- Routes ---

// ── Life-phase SQL CASE expression (plain string) ───
// Mirrors client-side computeLifePhase() logic using breed-specific thresholds
const LIFE_PHASE_SQL = `CASE
    WHEN c.life_phase_override IS NOT NULL THEN c.life_phase_override
    WHEN c.dob IS NULL AND c.sex = 'male' THEN 'bull'
    WHEN c.dob IS NULL THEN 'cow'
    WHEN c.sex = 'male' AND (julianday('now') - julianday(c.dob)) / 30.44 < COALESCE(bt.calf_max_months, 6) THEN 'calf'
    WHEN c.sex = 'male' AND (julianday('now') - julianday(c.dob)) / 30.44 < COALESCE(bt.young_bull_min_months, 15) THEN 'young_bull'
    WHEN c.sex = 'male' THEN 'bull'
    WHEN (julianday('now') - julianday(c.dob)) / 30.44 < COALESCE(bt.calf_max_months, 6) THEN 'calf'
    WHEN (julianday('now') - julianday(c.dob)) / 30.44 < COALESCE(bt.heifer_min_months, 15) THEN 'heifer'
    ELSE 'cow'
  END`;

// ── Last calving date subquery (plain string) ───
const LAST_CALVING_SQL = `(
    SELECT MAX(be.event_date)
    FROM breeding_events be
    WHERE be.cow_id = c.id AND be.event_type = 'calving'
  )`;

// GET /api/cows
router.get('/', async (req, res, next) => {
  try {
    const { error: qError } = cowQuerySchema.validate(req.query, { allowUnknown: false });
    if (qError) return res.status(400).json({ error: qError.details[0].message.replace(/['"]/g, '') });

    const query = db('cows as c')
      .leftJoin('breed_types as bt', 'c.breed_type_id', 'bt.id')
      .select(
        'c.*',
        'bt.name as breed_type_name',
        'bt.code as breed_type_code',
        db.raw(`${LAST_CALVING_SQL} as last_calving_date`)
      )
      .whereNull('c.deleted_at');

    // Search with input length guard
    if (req.query.search) {
      const search = String(req.query.search).slice(0, MAX_SEARCH_LENGTH);
      const s = `%${search}%`;
      query.where(function () {
        this.where('c.tag_number', 'like', s).orWhere('c.name', 'like', s);
      });
    }

    if (req.query.status) {
      query.where('c.status', req.query.status);
    }

    if (req.query.sex) {
      query.where('c.sex', req.query.sex);
    }

    if (req.query.breed_type_id) {
      query.where('c.breed_type_id', req.query.breed_type_id);
    }

    if (req.query.is_dry !== undefined) {
      query.where('c.is_dry', req.query.is_dry === 'true' || req.query.is_dry === '1');
    }

    // Life phase filter (SQL-computed from dob/sex/breed thresholds)
    if (req.query.life_phase) {
      query.whereRaw(`${LIFE_PHASE_SQL} = ?`, [req.query.life_phase]);
    }

    // Pregnant filter (uses cow.status which is updated by breeding events)
    if (req.query.pregnant !== undefined) {
      if (req.query.pregnant === 'true' || req.query.pregnant === '1') {
        query.where('c.status', 'pregnant');
      } else {
        query.whereNot('c.status', 'pregnant');
      }
    }

    // Days in Milk range (days since last calving)
    if (req.query.dim_min !== undefined || req.query.dim_max !== undefined) {
      if (req.query.dim_min !== undefined) {
        const dimMin = parseInt(String(req.query.dim_min), 10);
        if (!isNaN(dimMin) && dimMin >= 0) {
          query.whereRaw(`julianday('now') - julianday(${LAST_CALVING_SQL}) >= ?`, [dimMin]);
        }
      }
      if (req.query.dim_max !== undefined) {
        const dimMax = parseInt(String(req.query.dim_max), 10);
        if (!isNaN(dimMax) && dimMax >= 0) {
          query.whereRaw(`julianday('now') - julianday(${LAST_CALVING_SQL}) <= ?`, [dimMax]);
        }
      }
    }

    // Last calving date range
    if (req.query.calving_after) {
      query.whereRaw(`${LAST_CALVING_SQL} >= ?`, [req.query.calving_after]);
    }
    if (req.query.calving_before) {
      query.whereRaw(`${LAST_CALVING_SQL} <= ?`, [req.query.calving_before]);
    }

    // Average daily milk yield range (last 7 days)
    if (req.query.yield_min !== undefined || req.query.yield_max !== undefined) {
      const yieldSub = `(
        SELECT AVG(daily_total) FROM (
          SELECT mr.recording_date, SUM(mr.litres) as daily_total
          FROM milk_records mr
          WHERE mr.cow_id = c.id
            AND mr.recording_date >= date('now', '-7 days')
          GROUP BY mr.recording_date
        )
      )`;
      if (req.query.yield_min !== undefined) {
        const yMin = parseFloat(String(req.query.yield_min));
        if (!isNaN(yMin) && yMin >= 0) {
          query.whereRaw(`${yieldSub} >= ?`, [yMin]);
        }
      }
      if (req.query.yield_max !== undefined) {
        const yMax = parseFloat(String(req.query.yield_max));
        if (!isNaN(yMax) && yMax >= 0) {
          query.whereRaw(`${yieldSub} <= ?`, [yMax]);
        }
      }
    }

    // Pagination
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * limit;

    const [{ count: total }] = await query.clone().clearSelect().count('* as count');
    const cows = await query.orderBy('c.tag_number').limit(limit).offset(offset);

    res.set('X-Total-Count', String(total));
    res.json(cows);
  } catch (err) {
    next(err);
  }
});

// GET /api/cows/:id
router.get('/:id', async (req, res, next) => {
  try {
    // Single query with LEFT JOINs to resolve sire/dam names
    const cow = await db('cows as c')
      .where('c.id', req.params.id)
      .whereNull('c.deleted_at')
      .leftJoin('cows as sire', 'c.sire_id', 'sire.id')
      .leftJoin('cows as dam', 'c.dam_id', 'dam.id')
      .leftJoin('breed_types as bt', 'c.breed_type_id', 'bt.id')
      .select(
        'c.*',
        db.raw('COALESCE(sire.name, sire.tag_number) as sire_name'),
        db.raw('COALESCE(dam.name, dam.tag_number) as dam_name'),
        'bt.name as breed_type_name',
        'bt.code as breed_type_code'
      )
      .first();

    if (!cow) {
      return res.status(404).json({ error: 'Cow not found' });
    }

    res.json(cow);
  } catch (err) {
    next(err);
  }
});

// POST /api/cows
router.post('/', authorize('can_manage_cows'), async (req, res, next) => {
  try {
    const { error, value } = cowSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') });

    const now = new Date().toISOString();
    const cow = { id: uuidv4(), ...value, created_by: req.user.id, created_at: now, updated_at: now };
    await db('cows').insert(cow);

    // Coerce booleans to 0/1 to match SQLite's stored representation
    const response = { ...cow };
    if (response.is_external !== undefined) response.is_external = response.is_external ? 1 : 0;
    if (response.is_dry !== undefined) response.is_dry = response.is_dry ? 1 : 0;
    logAudit({ userId: req.user.id, action: 'create', entityType: 'cow', entityId: cow.id, newValues: response });
    res.status(201).json(response);
  } catch (err) {
    // Unique constraint errors are handled centrally by errorHandler
    next(err);
  }
});

// PUT /api/cows/:id
router.put('/:id', authorize('can_manage_cows'), async (req, res, next) => {
  try {
    const oldCow = await findCowOrFail(req.params.id);

    const { error, value } = cowUpdateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') });

    await db('cows').where({ id: req.params.id }).update({ ...value, updated_at: new Date().toISOString() });

    const updated = await db('cows').where({ id: req.params.id }).first();
    logAudit({ userId: req.user.id, action: 'update', entityType: 'cow', entityId: req.params.id, oldValues: oldCow, newValues: updated });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cows/:id — soft delete, admin only
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const cow = await findCowOrFail(req.params.id);

    await db('cows').where({ id: req.params.id }).update({ deleted_at: new Date().toISOString() });
    logAudit({ userId: req.user.id, action: 'delete', entityType: 'cow', entityId: req.params.id, oldValues: cow });
    res.json({ message: 'Cow deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
