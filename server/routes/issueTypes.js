const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')
const authorize = require('../middleware/authorize')

const router = express.Router()
router.use(authenticate)

const schema = Joi.object({
  name: Joi.string().max(100).required(),
  emoji: Joi.string().max(10).required(),
  requires_teat_selection: Joi.boolean().default(false),
  is_active: Joi.boolean().default(true),
  sort_order: Joi.number().integer().min(0).default(0),
})

// Derive a URL-safe code slug from a name string
function toCode(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50)
}

const MAX_SEARCH_LENGTH = 100
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

// GET /api/issue-types — active only by default; ?all=1 for all
router.get('/', async (req, res, next) => {
  try {
    const query = db('issue_type_definitions')
      .where(req.query.all === '1' ? {} : { is_active: true })
      .orderBy('sort_order')
      .orderBy('name')

    if (req.query.search) {
      const s = `%${String(req.query.search).slice(0, MAX_SEARCH_LENGTH)}%`
      query.where('name', 'like', s)
    }

    if (req.query.page !== undefined) {
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1)
      const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query.limit), 10) || DEFAULT_PAGE_SIZE))
      const offset = (page - 1) * limit

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
router.post('/', authorize('admin'), async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const code = toCode(value.name)
    if (!code) return res.status(400).json({ error: 'Name produces an empty code' })

    const existing = await db('issue_type_definitions').where({ code }).first()
    if (existing) {
      return res.status(409).json({ error: `Issue type with code "${code}" already exists` })
    }

    const id = uuidv4()
    const now = new Date().toISOString()
    await db('issue_type_definitions').insert({ id, code, ...value, created_at: now, updated_at: now })
    const created = await db('issue_type_definitions').where({ id }).first()
    res.status(201).json(created)
  } catch (err) {
    next(err)
  }
})

// PUT /api/issue-types/:id — admin only (code is immutable after creation)
router.put('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const existing = await db('issue_type_definitions').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Issue type not found' })

    const { error, value } = schema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })

    const now = new Date().toISOString()
    await db('issue_type_definitions')
      .where({ id: req.params.id })
      .update({ ...value, updated_at: now })
    const updated = await db('issue_type_definitions').where({ id: req.params.id }).first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/issue-types/:id — admin only; blocked if any health issues reference this code
router.delete('/:id', authorize('admin'), async (req, res, next) => {
  try {
    const existing = await db('issue_type_definitions').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: 'Issue type not found' })

    const usageResult = await db('health_issues')
      .whereRaw('issue_types LIKE ?', [`%"${existing.code}"%`])
      .count('* as count')
      .first()

    const count = Number(usageResult?.count ?? 0)
    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete: this type is used in ${count} health issue(s). Deactivate it instead.`,
      })
    }

    await db('issue_type_definitions').where({ id: req.params.id }).delete()
    res.json({ message: 'Issue type deleted' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
