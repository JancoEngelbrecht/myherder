const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')
const { nodeEnv, isProduction, corsOrigins } = require('./config/env')
const errorHandler = require('./middleware/errorHandler')

const app = express()

app.use(helmet())
// corsOrigins is always a non-null array — never pass undefined to cors()
app.use(cors({ origin: corsOrigins, credentials: true }))
app.use(express.json({ limit: '1mb' }))

// Request logging — suppress in tests to keep output clean
if (nodeEnv !== 'test') {
  app.use((req, _res, next) => {
    const url = isProduction ? req.path : req.url
    console.log(`${req.method} ${url}`)
    next()
  })
}

app.use('/api/auth', require('./routes/auth'))
app.use('/api/cows', require('./routes/cows'))
app.use('/api/analytics', require('./routes/analytics'))
app.use('/api/medications', require('./routes/medications'))
app.use('/api/treatments', require('./routes/treatments'))
app.use('/api/health-issues', require('./routes/healthIssues'))
app.use('/api/issue-types', require('./routes/issueTypes'))
app.use('/api/milk-records', require('./routes/milkRecords'))
app.use('/api/breeding-events', require('./routes/breedingEvents'))
app.use('/api/breed-types', require('./routes/breedTypes'))
app.use('/api/sync', require('./routes/sync'))
app.use('/api/feature-flags', require('./routes/featureFlags'))
app.use('/api/users', require('./routes/users'))
app.use('/api/settings', require('./routes/appSettings'))
app.use('/api/export', require('./routes/export'))
app.use('/api/reports', require('./routes/reports'))
app.use('/api/audit-log', require('./routes/auditLog'))

// Serve Vue SPA in production (no-op in test/development since client/dist may not exist)
const clientDist = path.join(__dirname, '../client/dist')
app.use(express.static(clientDist))
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next()
  })
})

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use(errorHandler)

module.exports = app
