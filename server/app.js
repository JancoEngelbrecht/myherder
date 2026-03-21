const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')
const { nodeEnv, isProduction, corsOrigins } = require('./config/env')
const errorHandler = require('./middleware/errorHandler')
const { requestStatsMiddleware } = require('./helpers/requestStats')

const app = express()

// Trust first proxy (Passenger/cPanel reverse proxy) so express-rate-limit reads X-Forwarded-For correctly
if (isProduction) app.set('trust proxy', 1)

app.use(helmet())
// corsOrigins is always a non-null array — never pass undefined to cors()
app.use(cors({ origin: corsOrigins, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(requestStatsMiddleware)

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
app.use('/api/farms', require('./routes/farms'))
app.use('/api/global-defaults', require('./routes/globalDefaults'))
app.use('/api/announcements', require('./routes/announcements'))
app.use('/api/system', require('./routes/systemHealth'))

// Serve Vue SPA in production (no-op in test/development since client/dist may not exist)
const clientDist = path.join(__dirname, '../client/dist')
app.use(
  express.static(clientDist, {
    setHeaders: (res, filePath) => {
      const rel = path.relative(clientDist, filePath)
      if (rel.startsWith('assets' + path.sep)) {
        // Vite hashes every filename inside assets/ — safe to cache forever
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      } else {
        // Non-hashed files: index.html, sw.js, registerSW.js, manifest.json, icons, etc.
        // Must always be re-fetched so updates are picked up immediately
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      }
    },
  })
)
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(err)
  })
})

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use(errorHandler)

module.exports = app
