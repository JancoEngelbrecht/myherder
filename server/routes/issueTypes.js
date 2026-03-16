const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const { requireAdmin } = require('../middleware/authorize')
const tenantScope = require('../middleware/tenantScope')
const { toCode, MAX_SEARCH_LENGTH, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE, parsePagination, joiMsg, validateBody, validateQuery } = require('../helpers/constants')

const router = express.Router()
router.use(authenticate)
router.use(tenantScope)

const schema = Joi.object({
  name: Joi.string().max(100).required(),
  emoji: Joi.string().max(10).required(),
  requires_teat_selection: Joi.boolean().truthy(1).falsy(0).default(false),
  is_active: Joi.boolean().truthy(1).falsy(0).default(true),
  sort_order: Joi.number().integer().min(0).default(0),
})

const issueTypeQuerySchema = Joi.object({
  all: Joi.string().valid('0', '1'),
  search: Joi.string().max(100).allow(''),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(MAX_PAGE_SIZE),
})

// GET /api/issue-types — active only by default; ?all=1 for all
router.get('/', async (req, res, next) => {
  try {
    const { error: qError } = validateQuery(issueTypeQuerySchema, req.query)
    if (qError) return res.status(400).json({ error: joiMsg(qError) })

    const showAll = req.query.all === '1' && (req.user.role === 'admin' || req.user.role === 'super_admin')
    const query = db('issue_type_definitions')
      .where('farm_id', req.farmId)
      .where(showAll ? {} : { is_active: true })
      .orderBy('sort_order')
      .orderBy('name')

    if (req.query.search) {
      const s = `%${String(req.query.search).slice(0, MAX_SEARCH_LENGTH)}%`
      query.where('name', 'like', s)
    }

    if (req.query.page !== undefined) {
      const { limit, offset } = parsePagination(req.query, { defaultLimit: DEFAULT_PAGE_SIZE })

      const [{ count: total }] = await query.clone().count('* as count')
      const rows = await query.limit(limit).offset(offset)

      res.set('X-Total-Count', String(total))
      res.json(rows)
    } else {
      const rows = await query
      res.set('X-Total-Count', String(rows.length))
      res.json(rows)
    }
  } catch (err) {
    next(err)
  }
})

// POST /api/issue-types — admin only
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { error, value } = validateBody(schema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const code = toCode(value.name)
    if (!code) return res.status(400).json({ error: 'Name produces an empty code' })

    const existing = await db('issue_type_definitions').where({ code }).where('farm_id', req.farmId).first()
    if (existing) {
      return res.status(409).json({ error: `Issue type with code "${code}" already exists` })
    }

    const id = uuidv4()
    const now = new Date().toISOString()
    const record = { id, farm_id: req.user.farm_id, code, ...value, created_at: now, updated_at: now }
    await db('issue_type_definitions').insert(record)
    // Coerce booleans to 0/1 to match SQLite's stored representation
    res.status(201).json({ ...record, is_active: record.is_active ? 1 : 0, requires_teat_selection: record.requires_teat_selection ? 1 : 0 })
  } catch (err) {
    next(err)
  }
})

// PUT /api/issue-types/:id — admin only (code is immutable after creation)
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const existing = await db('issue_type_definitions').where({ id: req.params.id }).where('farm_id', req.farmId).first()
    if (!existing) return res.status(404).json({ error: 'Issue type not found' })

    const { error, value } = validateBody(schema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const now = new Date().toISOString()
    await db('issue_type_definitions')
      .where({ id: req.params.id })
      .where('farm_id', req.farmId)
      .update({ ...value, updated_at: now })
    const updated = await db('issue_type_definitions').where({ id: req.params.id }).where('farm_id', req.farmId).first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/issue-types/:id — admin only; blocked if any health issues reference this code
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const existing = await db('issue_type_definitions').where({ id: req.params.id }).where('farm_id', req.farmId).first()
    if (!existing) return res.status(404).json({ error: 'Issue type not found' })

    const escapedCode = existing.code.replace(/[_%]/g, '\\$&')
    const usageResult = await db('health_issues')
      .where('farm_id', req.farmId)
      .whereRaw('issue_types LIKE ? ESCAPE ?', [`%"${escapedCode}"%`, '\\'])
      .count('* as count')
      .first()

    const count = Number(usageResult?.count ?? 0)
    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete: this type is used in ${count} health issue(s). Deactivate it instead.`,
      })
    }

    await db('issue_type_definitions').where({ id: req.params.id }).where('farm_id', req.farmId).delete()
    res.json({ message: 'Issue type deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
