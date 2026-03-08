const express = require('express');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const tenantScope = require('../../middleware/tenantScope');

const router = express.Router();
router.use(auth);
router.use(tenantScope);
router.use(authorize('can_view_analytics'));

router.use('/', require('./kpi'));
router.use('/', require('./financial'));
router.use('/', require('./fertility'));
router.use('/', require('./health'));
router.use('/', require('./structure'));

module.exports = router;
