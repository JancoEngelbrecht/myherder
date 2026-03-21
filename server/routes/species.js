const express = require('express')
const db = require('../config/database')

const router = express.Router()

// GET /api/species — public (no auth), returns active species with config
router.get('/', async (_req, res, next) => {
  try {
    const rows = await db('species')
      .where('is_active', true)
      .orderBy('sort_order')
      .orderBy('name')

    // Parse config JSON
    const species = rows.map((row) => {
      let config = {}
      if (row.config) {
        try { config = JSON.parse(row.config) } catch { config = {} }
      }
      return { ...row, config }
    })

    res.json(species)
  } catch (err) {
    next(err)
  }
})

// GET /api/species/:id — single species with parsed config
router.get('/:id', async (req, res, next) => {
  try {
    const row = await db('species').where('id', req.params.id).first()
    if (!row) return res.status(404).json({ error: 'Species not found' })

    let config = {}
    if (row.config) {
      try { config = JSON.parse(row.config) } catch { config = {} }
    }

    res.json({ ...row, config })
  } catch (err) {
    next(err)
  }
})

module.exports = router
