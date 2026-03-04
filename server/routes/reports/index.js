const express = require('express')
const Joi = require('joi')
const authenticate = require('../../middleware/auth')
const { requireAdmin } = require('../../middleware/authorize')
const {
  getFarmName,
  createPdfDocument,
  drawPdfTable,
  createExcelReport,
  sendFile,
} = require('../../services/reportService')

const router = express.Router()
router.use(authenticate)
router.use(requireAdmin)

// ── Validation ──────────────────────────────────────────────

const querySchema = Joi.object({
  from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  format: Joi.string().valid('pdf', 'xlsx').default('pdf'),
})

function validateQuery(req, res) {
  const { error, value } = querySchema.validate(req.query)
  if (error) {
    res.status(400).json({ error: error.details[0].message.replace(/['"]/g, '') })
    return null
  }
  return value
}

// ── Shared Report Generator ─────────────────────────────────

async function generateReport(req, res, next, { title, sheetName, slug, columns, getData }) {
  try {
    const params = validateQuery(req, res)
    if (!params) return

    const { from, to, format } = params
    const farmName = await getFarmName()
    const { rows, summaryRow } = await getData(from, to)

    const dateRange = { from, to }
    const generatedBy = req.user.full_name

    if (format === 'xlsx') {
      const buffer = await createExcelReport({
        title, sheetName, farmName, dateRange, generatedBy, columns, rows, summaryRow,
      })
      return sendFile(res, buffer, `${slug}-${from}-to-${to}`, 'xlsx')
    }

    const { doc, finalize } = createPdfDocument({ title, farmName, dateRange, generatedBy })
    drawPdfTable(doc, { columns, rows, summaryRow })
    const buffer = await finalize()
    sendFile(res, buffer, `${slug}-${from}-to-${to}`, 'pdf')
  } catch (err) {
    next(err)
  }
}

router.use('/', require('./treatment'))
router.use('/', require('./production'))
router.use('/', require('./herd'))

module.exports = router
module.exports.generateReport = generateReport
