const express = require('express')
const Joi = require('joi')
const db = require('../config/database')
const authenticate = require('../middleware/auth')

const router = express.Router()
router.use(authenticate)

const updateSchema = Joi.object({
  name: Joi.string().max(100).required(),
  emoji: Joi.string().max(10).required(),
  is_active: Joi.boolean().required(),
  sort_order: Joi.number().integer().min(0).required(),
})

// GET /api/breeding-event-types — all types ordered by sort_order
router.get('/', async (req, res, next) => {
  try {
    const rows = await db('breeding_event_types').orderBy('sort_order', 'asc')
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/breeding-event-types/:code — admin only, update name/emoji/active/order
router.patch('/:code', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })

    const row = await db('breeding_event_types').where({ code: req.params.code }).first()
    if (!row) return res.status(404).json({ error: 'Breeding event type not found' })

    const { error, value } = updateSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message })

    const now = new Date().toISOString()
    await db('breeding_event_types').where({ code: req.params.code }).update({
      name: value.name,
      emoji: value.emoji,
      is_active: value.is_active,
      sort_order: value.sort_order,
      updated_at: now,
    })

    const updated = await db('breeding_event_types').where({ code: req.params.code }).first()
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

module.exports = router
