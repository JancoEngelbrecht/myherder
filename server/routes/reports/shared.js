const Joi = require('joi')
const { joiMsg, validateQuery } = require('../../helpers/constants')
const {
  getFarmName,
  createPdfDocument,
  drawPdfTable,
  createExcelReport,
  sendFile,
} = require('../../services/reportService')

// ── Validation ──────────────────────────────────────────────

const querySchema = Joi.object({
  from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  format: Joi.string().valid('pdf', 'xlsx').default('pdf'),
})

function validateReportQuery(req, res) {
  const { error, value } = validateQuery(querySchema, req.query)
  if (error) {
    res.status(400).json({ error: joiMsg(error) })
    return null
  }
  return value
}

// ── Shared Report Generator ─────────────────────────────────

async function generateReport(req, res, next, { title, sheetName, slug, columns, getData }) {
  try {
    const params = validateReportQuery(req, res)
    if (!params) return

    const { from, to, format } = params
    const farmName = await getFarmName(req.farmId)
    const { rows, summaryRow } = await getData(from, to, req.farmId)

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

module.exports = { generateReport }
