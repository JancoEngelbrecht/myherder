const express = require('express')
const authenticate = require('../../middleware/auth')
const { requireAdmin } = require('../../middleware/authorize')
const tenantScope = require('../../middleware/tenantScope')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)
router.use(tenantScope)

router.use('/', require('./treatment'))
router.use('/', require('./production'))
router.use('/', require('./herd'))

module.exports = router
