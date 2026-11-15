// Retention cron — trims unbounded-growth tables to stay within hosting limits.
// cPanel cron (weekly, Sunday 02:00) — NODE_ENV=production is REQUIRED, otherwise
// the script falls back to the development (SQLite) config:
//   source /home/myherder/nodevenv/repositories/myherder/24/bin/activate && cd /home/myherder/repositories/myherder && NODE_ENV=production node server/cron/retention.js
// Dry run (counts only, deletes nothing): append `--dry-run`
//
// When run directly, this script creates its own Knex instance so that
// db.destroy() does not affect the singleton used by the running server.

const AUDIT_RETENTION_MS = 2 * 365 * 86400 * 1000 // 2 years
const SYNC_RETENTION_MS = 90 * 86400 * 1000 // 90 days
const BATCH_SIZE = 5000 // rows per DELETE — keeps InnoDB lock time + undo log small

// 'YYYY-MM-DD HH:MM:SS' (UTC) — matches DATETIME/TIMESTAMP format on MySQL and
// knex.fn.now() storage on SQLite, avoiding ISO 'T'/'Z' parsing quirks.
function toDbTimestamp(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

// Delete matching rows in id-batches until none remain. Returns total deleted.
async function deleteInBatches(db, table, column, cutoff) {
  let total = 0
  for (;;) {
    const ids = (await db(table).where(column, '<', cutoff).select('id').limit(BATCH_SIZE)).map(
      (r) => r.id
    )
    if (ids.length === 0) break
    const deleted = Number(await db(table).whereIn('id', ids).del())
    total += deleted
    if (deleted === 0 || ids.length < BATCH_SIZE) break
  }
  return total
}

/**
 * Delete (or count, when dryRun) audit_log rows older than 2 years and
 * sync_log rows older than 90 days.
 * @param {import('knex').Knex} db
 * @param {{ dryRun?: boolean, now?: number, log?: (msg: string) => void }} [opts]
 */
async function runRetention(db, { dryRun = false, now = Date.now(), log = () => {} } = {}) {
  const auditCutoff = toDbTimestamp(now - AUDIT_RETENTION_MS)
  const syncCutoff = toDbTimestamp(now - SYNC_RETENTION_MS)
  const verb = dryRun ? 'would delete' : 'deleted'

  log(
    `[retention] ${dryRun ? 'DRY RUN — ' : ''}audit_log cutoff: ${auditCutoff}, sync_log cutoff: ${syncCutoff}`
  )

  const auditQuery = db('audit_log').where('created_at', '<', auditCutoff)
  const syncQuery = db('sync_log').where('synced_at', '<', syncCutoff)

  let auditDeleted
  let syncDeleted
  if (dryRun) {
    const [a, s] = await Promise.all([
      auditQuery.count('* as count').first(),
      syncQuery.count('* as count').first(),
    ])
    auditDeleted = Number(a?.count ?? 0)
    syncDeleted = Number(s?.count ?? 0)
  } else {
    auditDeleted = await deleteInBatches(db, 'audit_log', 'created_at', auditCutoff)
    syncDeleted = await deleteInBatches(db, 'sync_log', 'synced_at', syncCutoff)
  }

  log(`[retention] audit_log rows ${verb}: ${auditDeleted}`)
  log(`[retention] sync_log  rows ${verb}: ${syncDeleted}`)

  return { auditDeleted, syncDeleted, auditCutoff, syncCutoff, dryRun }
}

module.exports = { runRetention, BATCH_SIZE }

if (require.main === module) {
  require('dotenv').config()
  const knexLib = require('knex')
  const knexConfig = require('../../knexfile')
  const env = process.env.NODE_ENV || 'development'
  const db = knexLib(knexConfig[env])
  const dryRun = process.argv.includes('--dry-run')
  console.log(`[retention] env=${env} client=${knexConfig[env].client}`)

  runRetention(db, { dryRun, log: (msg) => console.log(msg) })
    .then(() => console.log('[retention] done.'))
    .catch((err) => {
      console.error('[retention] FAILED:', err.message || err)
      process.exitCode = 1
    })
    .finally(() => db.destroy())
}
