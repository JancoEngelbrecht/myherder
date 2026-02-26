const express = require('express');
const Joi = require('joi');
const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

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

// GET /api/cows
router.get('/', async (req, res, next) => {
  try {
    const query = db('cows as c')
      .leftJoin('breed_types as bt', 'c.breed_type_id', 'bt.id')
      .select('c.*', 'bt.name as breed_type_name', 'bt.code as breed_type_code')
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
    if (error) return res.status(400).json({ error: error.details[0].message });

    const cow = { id: uuidv4(), ...value, created_by: req.user.id };
    await db('cows').insert(cow);

    const created = await db('cows').where({ id: cow.id }).first();
    res.status(201).json(created);
  } catch (err) {
    // Unique constraint errors are handled centrally by errorHandler
    next(err);
  }
});

// PUT /api/cows/:id
router.put('/:id', authorize('can_manage_cows'), async (req, res, next) => {
  try {
    await findCowOrFail(req.params.id);

    const { error, value } = cowUpdateSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    await db('cows').where({ id: req.params.id }).update({ ...value, updated_at: new Date().toISOString() });

    const updated = await db('cows').where({ id: req.params.id }).first();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cows/:id — soft delete, admin only
router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try {
    await findCowOrFail(req.params.id);

    await db('cows').where({ id: req.params.id }).update({ deleted_at: new Date().toISOString() });
    res.json({ message: 'Cow deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
