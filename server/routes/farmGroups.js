const express = require('express')
const { randomUUID: uuidv4 } = require('crypto')
const Joi = require('joi')
const db = require('../config/database')
const { logAudit } = require('../services/auditService')
const { joiMsg, validateBody } = require('../helpers/constants')

const authenticate = require('../middleware/auth')
const requireSuperAdmin = require('../middleware/requireSuperAdmin')

const router = express.Router()
router.use(authenticate)
router.use(requireSuperAdmin)

// ── Validation ───────────────────────────────────────────────

const createSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  farm_ids: Joi.array().items(Joi.string().uuid()).min(2).required(),
})

const updateSchema = Joi.object({
  name: Joi.string().min(2).max(100),
}).min(1)

const addFarmsSchema = Joi.object({
  farm_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
})

// ── Helpers ───────────────────────────────────────────────────

/**
 * Fetch a single group with its member farms.
 * Returns null if not found.
 */
async function fetchGroupWithFarms(groupId) {
  const group = await db('farm_groups').where('id', groupId).first()
  if (!group) return null
  const farms = await db('farm_group_members')
    .join('farms', 'farm_group_members.farm_id', 'farms.id')
    .where('farm_group_members.farm_group_id', groupId)
    .select('farms.id', 'farms.name', 'farms.code', 'farms.is_active')
    .orderBy('farms.name')
  return { ...group, farms }
}

/**
 * Check that all farm_ids exist and are active.
 * Returns the first bad ID, or null if all are valid.
 */
async function findInvalidFarm(farmIds) {
  const rows = await db('farms').whereIn('id', farmIds).where('is_active', true).select('id')
  const found = new Set(rows.map((r) => r.id))
  return farmIds.find((id) => !found.has(id)) || null
}

/**
 * Check that none of the farm_ids are already in any group.
 * Returns the first conflicting farm name, or null if none.
 */
async function findFarmAlreadyInGroup(farmIds) {
  const existing = await db('farm_group_members')
    .join('farms', 'farm_group_members.farm_id', 'farms.id')
    .whereIn('farm_group_members.farm_id', farmIds)
    .select('farms.name')
    .first()
  return existing ? existing.name : null
}

// ── Routes ───────────────────────────────────────────────────

// GET /api/farm-groups — list all groups with member farms
router.get('/', async (req, res, next) => {
  try {
    const groups = await db('farm_groups').orderBy('name')
    const memberRows = await db('farm_group_members')
      .join('farms', 'farm_group_members.farm_id', 'farms.id')
      .select(
        'farm_group_members.farm_group_id',
        'farms.id',
        'farms.name',
        'farms.code',
        'farms.is_active'
      )
      .orderBy('farms.name')

    // Group members by farm_group_id
    const membersByGroup = {}
    for (const row of memberRows) {
      const { farm_group_id, ...farm } = row
      ;(membersByGroup[farm_group_id] ||= []).push(farm)
    }

    res.json(groups.map((g) => ({ ...g, farms: membersByGroup[g.id] || [] })))
  } catch (err) {
    next(err)
  }
})

// POST /api/farm-groups — create a new group
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = validateBody(createSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    // Validate all farms exist and are active
    const badFarm = await findInvalidFarm(value.farm_ids)
    if (badFarm) return res.status(400).json({ error: `Farm not found or inactive: ${badFarm}` })

    // Check no farm is already in a group
    const conflictName = await findFarmAlreadyInGroup(value.farm_ids)
    if (conflictName)
      return res.status(409).json({ error: `Farm ${conflictName} is already in a group` })

    const groupId = uuidv4()
    const now = new Date().toISOString()

    await db.transaction(async (trx) => {
      await trx('farm_groups').insert({
        id: groupId,
        name: value.name,
        created_at: now,
        updated_at: now,
      })
      await trx('farm_group_members').insert(
        value.farm_ids.map((farmId) => ({
          id: uuidv4(),
          farm_group_id: groupId,
          farm_id: farmId,
          added_at: now,
        }))
      )
    })

    await logAudit({
      farmId: null,
      userId: req.user.id,
      action: 'create',
      entityType: 'farm_group',
      entityId: groupId,
      newValues: { name: value.name, farm_ids: value.farm_ids },
    })

    const group = await fetchGroupWithFarms(groupId)
    res.status(201).json(group)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/farm-groups/:id — rename a group
router.patch('/:id', async (req, res, next) => {
  try {
    const group = await db('farm_groups').where('id', req.params.id).first()
    if (!group) return res.status(404).json({ error: 'Farm group not found' })

    const { error, value } = validateBody(updateSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    const now = new Date().toISOString()
    await db('farm_groups').where('id', group.id).update({ name: value.name, updated_at: now })

    await logAudit({
      farmId: null,
      userId: req.user.id,
      action: 'update',
      entityType: 'farm_group',
      entityId: group.id,
      oldValues: { name: group.name },
      newValues: { name: value.name },
    })

    const updated = await fetchGroupWithFarms(group.id)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/farm-groups/:id — delete a group and all its members
router.delete('/:id', async (req, res, next) => {
  try {
    const group = await db('farm_groups').where('id', req.params.id).first()
    if (!group) return res.status(404).json({ error: 'Farm group not found' })

    await db.transaction(async (trx) => {
      await trx('farm_group_members').where('farm_group_id', group.id).del()
      await trx('farm_groups').where('id', group.id).del()
    })

    await logAudit({
      farmId: null,
      userId: req.user.id,
      action: 'delete',
      entityType: 'farm_group',
      entityId: group.id,
      oldValues: { name: group.name },
    })

    res.json({ message: 'Farm group deleted' })
  } catch (err) {
    next(err)
  }
})

// POST /api/farm-groups/:id/farms — add farms to an existing group
router.post('/:id/farms', async (req, res, next) => {
  try {
    const group = await db('farm_groups').where('id', req.params.id).first()
    if (!group) return res.status(404).json({ error: 'Farm group not found' })

    const { error, value } = validateBody(addFarmsSchema, req.body)
    if (error) return res.status(400).json({ error: joiMsg(error) })

    // Validate all farms exist and are active
    const badFarm = await findInvalidFarm(value.farm_ids)
    if (badFarm) return res.status(400).json({ error: `Farm not found or inactive: ${badFarm}` })

    // Check no farm is already in any group
    const conflictName = await findFarmAlreadyInGroup(value.farm_ids)
    if (conflictName)
      return res.status(409).json({ error: `Farm ${conflictName} is already in a group` })

    const now = new Date().toISOString()
    await db('farm_group_members').insert(
      value.farm_ids.map((farmId) => ({
        id: uuidv4(),
        farm_group_id: group.id,
        farm_id: farmId,
        added_at: now,
      }))
    )

    await logAudit({
      farmId: null,
      userId: req.user.id,
      action: 'update',
      entityType: 'farm_group',
      entityId: group.id,
      newValues: { added_farm_ids: value.farm_ids },
    })

    const updated = await fetchGroupWithFarms(group.id)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/farm-groups/:id/farms/:farmId — remove a farm from a group
router.delete('/:id/farms/:farmId', async (req, res, next) => {
  try {
    const group = await db('farm_groups').where('id', req.params.id).first()
    if (!group) return res.status(404).json({ error: 'Farm group not found' })

    const member = await db('farm_group_members')
      .where({ farm_group_id: group.id, farm_id: req.params.farmId })
      .first()
    if (!member) return res.status(404).json({ error: 'Farm not found in this group' })

    await db('farm_group_members').where('id', member.id).del()

    // Count remaining members
    const [{ count: remaining }] = await db('farm_group_members')
      .where('farm_group_id', group.id)
      .count('* as count')

    await logAudit({
      farmId: null,
      userId: req.user.id,
      action: 'update',
      entityType: 'farm_group',
      entityId: group.id,
      newValues: { removed_farm_id: req.params.farmId },
    })

    if (Number(remaining) < 2) {
      // Auto-delete the group — it no longer meets the minimum
      await db.transaction(async (trx) => {
        await trx('farm_group_members').where('farm_group_id', group.id).del()
        await trx('farm_groups').where('id', group.id).del()
      })
      return res.json({ message: 'Farm removed. Group deleted (below minimum of 2 farms).' })
    }

    const updated = await fetchGroupWithFarms(group.id)
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

module.exports = router
