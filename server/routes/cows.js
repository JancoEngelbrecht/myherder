const express = require('express');
const Joi = require('joi');
const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');
const auth = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const authorize = require('../middleware/authorize');
const { requireAdmin } = authorize;
const { logAudit } = require('../services/auditService');
const { ISO_DATE_RE, MAX_SEARCH_LENGTH, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE, parsePagination, COW_STATUSES, joiMsg, validateBody, validateQuery } = require('../helpers/constants');
const { isMySQL } = require('./analytics/helpers');

const router = express.Router();
router.use(auth);
router.use(tenantScope);

// ── Validation schemas ──────────────────────────────────────────

const cowSchema = Joi.object({
  tag_number: Joi.string().max(50).required(),
  name: Joi.string().max(100).allow('', null),
  dob: Joi.string().pattern(ISO_DATE_RE).allow('', null),
  breed: Joi.string().max(100).allow('', null),
  breed_type_id: Joi.string().max(36).allow(null, ''),
  sex: Joi.string().valid('female', 'male').default('female'),
  status: Joi.string().valid(...COW_STATUSES).default('active'),
  sire_id: Joi.string().uuid().allow(null),
  dam_id: Joi.string().uuid().allow(null),
  is_external: Joi.boolean().default(false),
  purpose: Joi.string().valid('natural_service', 'ai_semen_donor', 'both').allow(null, ''),
  life_phase_override: Joi.string().valid('calf', 'heifer', 'cow', 'young_bull', 'bull').allow(null, ''),
  notes: Joi.string().max(2000).allow('', null)
});

const cowUpdateSchema = cowSchema.fork('tag_number', (s) => s.optional());

const cowQuerySchema = Joi.object({
  search: Joi.string().max(100).allow(''),
  status: Joi.string().valid(...COW_STATUSES),
  sex: Joi.string().valid('female', 'male'),
  breed_type_id: Joi.string().max(36),
  life_phase: Joi.string().valid('calf', 'heifer', 'cow', 'young_bull', 'bull'),
  pregnant: Joi.string().valid('0', '1', 'true', 'false'),
  dim_min: Joi.number().integer().min(0),
  dim_max: Joi.number().integer().min(0),
  calving_after: Joi.string().pattern(ISO_DATE_RE),
  calving_before: Joi.string().pattern(ISO_DATE_RE),
  yield_min: Joi.number().min(0),
  yield_max: Joi.number().min(0),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE),
  sort: Joi.string().valid('tag_number', 'name', 'dob', 'status'),
  order: Joi.string().valid('asc', 'desc'),
});

// ── Helpers ─────────────────────────────────────────────────────

async function findCowOrFail(id, farmId) {
  const cow = await db('cows').where({ id }).where('farm_id', farmId).whereNull('deleted_at').first();
  if (!cow) {
    const err = new Error('Cow not found');
    err.status = 404;
    throw err;
  }
  return cow;
}

// ── Routes ──────────────────────────────────────────────────────

// ── Life-phase SQL CASE expression ───
// Mirrors client-side computeLifePhase() logic using breed-specific thresholds
// Portable: uses DATEDIFF on MySQL, julianday on SQLite
function lifePhaseSql() {
  const ageMonths = isMySQL()
    ? 'DATEDIFF(NOW(), c.dob) / 30.44'
    : '(julianday(\'now\') - julianday(c.dob)) / 30.44';
  return `CASE
    WHEN c.life_phase_override IS NOT NULL THEN c.life_phase_override
    WHEN c.dob IS NULL AND c.sex = 'male' THEN 'bull'
    WHEN c.dob IS NULL THEN 'cow'
    WHEN c.sex = 'male' AND ${ageMonths} < COALESCE(bt.calf_max_months, 6) THEN 'calf'
    WHEN c.sex = 'male' AND ${ageMonths} < COALESCE(bt.young_bull_min_months, 15) THEN 'young_bull'
    WHEN c.sex = 'male' THEN 'bull'
    WHEN ${ageMonths} < COALESCE(bt.calf_max_months, 6) THEN 'calf'
    WHEN ${ageMonths} < COALESCE(bt.heifer_min_months, 15) THEN 'heifer'
    ELSE 'cow'
  END`;
}

// ── Last calving date subquery (plain string) ───
const LAST_CALVING_SQL = `(
    SELECT MAX(be.event_date)
    FROM breeding_events be
    WHERE be.cow_id = c.id AND be.event_type = 'calving' AND be.farm_id = c.farm_id
  )`;

// GET /api/cows
router.get('/', async (req, res, next) => {
  try {
    const { error: qError, value: q } = validateQuery(cowQuerySchema, req.query);
    if (qError) return res.status(400).json({ error: joiMsg(qError) });

    const query = db('cows as c')
      .where('c.farm_id', req.farmId)
      .leftJoin('breed_types as bt', 'c.breed_type_id', 'bt.id')
      .select(
        'c.*',
        'bt.name as breed_type_name',
        'bt.code as breed_type_code',
        db.raw(`${LAST_CALVING_SQL} as last_calving_date`)
      )
      .whereNull('c.deleted_at');

    // Search with input length guard
    if (q.search) {
      const search = String(q.search).slice(0, MAX_SEARCH_LENGTH);
      const s = `%${search}%`;
      query.where(function () {
        this.where('c.tag_number', 'like', s).orWhere('c.name', 'like', s);
      });
    }

    if (q.status) query.where('c.status', q.status);
    if (q.sex) query.where('c.sex', q.sex);
    if (q.breed_type_id) query.where('c.breed_type_id', q.breed_type_id);

    // Life phase filter (SQL-computed from dob/sex/breed thresholds)
    if (q.life_phase) {
      query.whereRaw(`${lifePhaseSql()} = ?`, [q.life_phase]);
    }

    // Pregnant filter (uses cow.status which is updated by breeding events)
    if (q.pregnant !== undefined) {
      if (q.pregnant === 'true' || q.pregnant === '1') {
        query.where('c.status', 'pregnant');
      } else {
        query.whereNot('c.status', 'pregnant');
      }
    }

    // Days in Milk range (days since last calving)
    if (q.dim_min !== undefined || q.dim_max !== undefined) {
      const dimExpr = isMySQL()
        ? `DATEDIFF(NOW(), ${LAST_CALVING_SQL})`
        : `julianday('now') - julianday(${LAST_CALVING_SQL})`;
      if (q.dim_min !== undefined) {
        const dimMin = parseInt(String(q.dim_min), 10);
        if (!isNaN(dimMin) && dimMin >= 0) {
          query.whereRaw(`${dimExpr} >= ?`, [dimMin]);
        }
      }
      if (q.dim_max !== undefined) {
        const dimMax = parseInt(String(q.dim_max), 10);
        if (!isNaN(dimMax) && dimMax >= 0) {
          query.whereRaw(`${dimExpr} <= ?`, [dimMax]);
        }
      }
    }

    // Last calving date range
    if (q.calving_after) query.whereRaw(`${LAST_CALVING_SQL} >= ?`, [q.calving_after]);
    if (q.calving_before) query.whereRaw(`${LAST_CALVING_SQL} <= ?`, [q.calving_before]);

    // Average daily milk yield range (last 7 days)
    if (q.yield_min !== undefined || q.yield_max !== undefined) {
      const sevenDaysAgo = isMySQL()
        ? "DATE_SUB(NOW(), INTERVAL 7 DAY)"
        : "date('now', '-7 days')";
      const yieldSub = `(
        SELECT AVG(daily_total) FROM (
          SELECT mr.recording_date, SUM(mr.litres) as daily_total
          FROM milk_records mr
          WHERE mr.cow_id = c.id AND mr.farm_id = c.farm_id
            AND mr.recording_date >= ${sevenDaysAgo}
          GROUP BY mr.recording_date
        )
      )`;
      if (q.yield_min !== undefined) {
        const yMin = parseFloat(String(q.yield_min));
        if (!isNaN(yMin) && yMin >= 0) query.whereRaw(`${yieldSub} >= ?`, [yMin]);
      }
      if (q.yield_max !== undefined) {
        const yMax = parseFloat(String(q.yield_max));
        if (!isNaN(yMax) && yMax >= 0) query.whereRaw(`${yieldSub} <= ?`, [yMax]);
      }
    }

    // Pagination
    const { limit, offset } = parsePagination(q, { defaultLimit: DEFAULT_PAGE_SIZE });

    const sortMap = { tag_number: 'c.tag_number', name: 'c.name', dob: 'c.dob', status: 'c.status' };
    const sortCol = sortMap[String(q.sort)] || 'c.tag_number';
    const sortOrder = q.order === 'desc' ? 'desc' : 'asc';

    const [[{ count: total }], cows] = await Promise.all([
      query.clone().clearSelect().count('* as count'),
      query.orderBy(sortCol, sortOrder).limit(limit).offset(offset),
    ]);

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
      .where('c.farm_id', req.farmId)
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
    const { error, value } = validateBody(cowSchema, req.body);
    if (error) return res.status(400).json({ error: joiMsg(error) });

    const now = new Date().toISOString();
    const cow = { id: uuidv4(), ...value, farm_id: req.user.farm_id, created_by: req.user.id, created_at: now, updated_at: now };
    await db('cows').insert(cow);

    // Coerce booleans to 0/1 to match SQLite's stored representation
    const response = { ...cow };
    if (response.is_external !== undefined) response.is_external = response.is_external ? 1 : 0;
    await logAudit({ farmId: req.user.farm_id, userId: req.user.id, action: 'create', entityType: 'cow', entityId: cow.id, newValues: response });
    res.status(201).json(response);
  } catch (err) {
    // Unique constraint errors are handled centrally by errorHandler
    next(err);
  }
});

// PUT /api/cows/:id
router.put('/:id', authorize('can_manage_cows'), async (req, res, next) => {
  try {
    const oldCow = await findCowOrFail(req.params.id, req.farmId);

    const { error, value } = validateBody(cowUpdateSchema, req.body);
    if (error) return res.status(400).json({ error: joiMsg(error) });

    const now = new Date().toISOString();
    const updates = { ...value, updated_at: now };
    if (value.status && value.status !== oldCow.status) {
      updates.status_changed_at = now;
    }
    await db('cows').where({ id: req.params.id }).where('farm_id', req.farmId).update(updates);

    const updated = await db('cows').where({ id: req.params.id }).where('farm_id', req.farmId).first();
    await logAudit({ farmId: req.user.farm_id, userId: req.user.id, action: 'update', entityType: 'cow', entityId: req.params.id, oldValues: oldCow, newValues: updated });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cows/:id — soft delete, admin only
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const cow = await findCowOrFail(req.params.id, req.farmId);

    await db('cows').where({ id: req.params.id }).where('farm_id', req.farmId).update({ deleted_at: new Date().toISOString() });
    await logAudit({ farmId: req.user.farm_id, userId: req.user.id, action: 'delete', entityType: 'cow', entityId: req.params.id, oldValues: cow });
    res.json({ message: 'Cow deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
