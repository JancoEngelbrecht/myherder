// Passenger entry point
//
// Phusion Passenger (cPanel Node.js App) expects the startup file to export
// the Express app — it manages socket/port binding itself.
//
// For direct node execution (local dev, CI): use `node server/index.js`
// which calls app.listen() in the normal way.
//
// In cPanel → Node.js App Setup, set "Application startup file" to: app.js

module.exports = require('./dist/app')
