const app = require('./app')
const db = require('./config/database')
const { port, isProduction } = require('./config/env')

const server = app.listen(port, () => {
  console.log(
    `MyHerder server running on port ${port} [${isProduction ? 'production' : 'development'}]`
  )
})

server.on('error', (err) => {
  console.error('Server failed to start:', err.message)
  process.exit(1)
})

function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully`)
  server.close(() => {
    db.destroy()
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// Surface fatal errors to stderr before Passenger restarts the worker.
// Without these, unhandled rejections in Node 22+ crash silently.
process.on('unhandledRejection', (reason: unknown) => {
  const detail = reason instanceof Error ? reason.stack || reason.message : String(reason)
  console.error('[fatal] unhandledRejection:', detail)
})

process.on('uncaughtException', (err: Error) => {
  console.error('[fatal] uncaughtException:', err.stack || err.message)
  // Flush and exit — Passenger will respawn the worker.
  process.exit(1)
})
