const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')
const { nodeEnv, isProduction, allowedOrigins } = require('./config/env')
const errorHandler = require('./middleware/errorHandler')

const app = express()

app.use(helmet())
app.use(cors(allowedOrigins ? { origin: allowedOrigins, credentials: true } : undefined))
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
