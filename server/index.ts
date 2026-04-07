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
