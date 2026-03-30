/**
 * Sheep Video Demo Seed
 *
 * Layers demo-specific tweaks on top of sheep_farm_seed.js.
 * - Ensures 3 open health issues exist for the demo
 * - Ensures 2 undismissed breeding notifications for the demo
 *
 * SAFETY:
 * - Must run AFTER sheep_farm_seed.js (requires SKAAP farm to exist)
 * - Idempotent: checks before inserting, safe to re-run
 * - Insert-only for health issues, UPDATE-only for breeding events
 *
 * Usage:
 *   node server/scripts/sheep_video_demo_seed.js                  # dev (SQLite)
 *   NODE_ENV=production node server/scripts/sheep_video_demo_seed.js  # production (MySQL)
 */

require('dotenv').config()
const { v4: uuidv4 } = require('uuid')

const env = process.env.NODE_ENV || 'development'
const knexConfig = require('../../knexfile')[env]
const knex = require('knex')(knexConfig)

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[sheep-video-seed] Environment: ${env}`)

  // Find the sheep farm
  const farm = await knex('farms').where('code', 'SKAAP').first()
  if (!farm) {
    console.error(
      '[sheep-video-seed] FAILED: Sheep farm not found (code=SKAAP). Run sheep_farm_seed.js first.'
    )
    await knex.destroy()
    process.exit(1) // eslint-disable-line n/no-process-exit
  }

  const farmId = farm.id
  console.log(`[sheep-video-seed] Found sheep farm: ${farmId}`)

  // Find users
  const admin = await knex('users').where('farm_id', farmId).where('role', 'admin').first()
  const worker = await knex('users').where('farm_id', farmId).where('role', 'worker').first()

  if (!admin) {
    console.error('[sheep-video-seed] FAILED: No admin user found for sheep farm.')
    await knex.destroy()
    process.exit(1) // eslint-disable-line n/no-process-exit
  }

  console.log(`[sheep-video-seed] Admin: ${admin.username} (${admin.id})`)
  if (worker) {
    console.log(`[sheep-video-seed] Worker: ${worker.username} (${worker.id})`)
  }

  const now = new Date()
  function daysAgo(n) {
    const d = new Date(now)
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 19).replace('T', ' ')
  }

  // ── Ensure open health issues exist for the demo ────────────────────────

  // Get some sheep to attach issues to (S001 Wollie, S002 Skaapie, S004 Rooikop)
  const targetSheep = await knex('cows')
    .where('farm_id', farmId)
    .whereNull('deleted_at')
    .where('sex', 'female')
    .whereIn('tag_number', ['S001', 'S002', 'S004'])
    .select('id', 'tag_number', 'name')

  if (targetSheep.length === 0) {
    console.log('[sheep-video-seed] WARNING: No target sheep found, skipping health issues.')
  } else {
    const recentOpen = await knex('health_issues')
      .where('farm_id', farmId)
      .where('status', 'open')
      .count('* as cnt')
    const openCount = Number(recentOpen[0].cnt)

    if (openCount < 2) {
      const demoIssues = [
        {
          id: uuidv4(),
          farm_id: farmId,
          cow_id: targetSheep[0]?.id,
          reported_by: admin.id,
          issue_types: JSON.stringify(['internal_parasites']),
          severity: 'medium',
          affected_teats: null,
          description: 'Weight loss and pale gums noticed. Likely internal parasites.',
          observed_at: daysAgo(1),
          status: 'open',
          resolved_at: null,
          created_at: daysAgo(1),
          updated_at: daysAgo(1),
        },
        {
          id: uuidv4(),
          farm_id: farmId,
          cow_id: targetSheep[1]?.id || targetSheep[0]?.id,
          reported_by: worker?.id || admin.id,
          issue_types: JSON.stringify(['foot_rot']),
          severity: 'high',
          affected_teats: null,
          description: 'Swelling between toes on right front hoof, foul smell.',
          observed_at: daysAgo(2),
          status: 'treating',
          resolved_at: null,
          created_at: daysAgo(2),
          updated_at: daysAgo(1),
        },
        {
          id: uuidv4(),
          farm_id: farmId,
          cow_id: targetSheep[2]?.id || targetSheep[0]?.id,
          reported_by: admin.id,
          issue_types: JSON.stringify(['eye']),
          severity: 'low',
          affected_teats: null,
          description: 'Tearing in left eye, possible dust irritation.',
          observed_at: daysAgo(3),
          status: 'open',
          resolved_at: null,
          created_at: daysAgo(3),
          updated_at: daysAgo(3),
        },
      ]

      await knex('health_issues').insert(demoIssues)
      console.log(`[sheep-video-seed] ✓ Created ${demoIssues.length} demo health issues`)
    } else {
      console.log(`[sheep-video-seed] ✓ Already ${openCount} open issues — skipping`)
    }
  }

  // ── Dismiss ALL breeding events, then un-dismiss exactly 2 ──────────────
  // This ensures a clean notifications page regardless of when the seed runs.

  // Step 1: Dismiss every breeding event on this farm
  const dismissCount = await knex('breeding_events')
    .where('farm_id', farmId)
    .whereNull('dismissed_at')
    .update({ dismissed_at: now })
  console.log(`[sheep-video-seed] ✓ Dismissed ${dismissCount} breeding events`)

  // Step 2: Un-dismiss exactly 2 events so the demo has something to show
  const keepEvents = await knex('breeding_events')
    .where('farm_id', farmId)
    .whereNotNull('dismissed_at')
    .orderBy('created_at', 'desc')
    .limit(2)
    .select('id')

  if (keepEvents.length > 0) {
    await knex('breeding_events')
      .whereIn(
        'id',
        keepEvents.map((e) => e.id)
      )
      .update({ dismissed_at: null })
    console.log(`[sheep-video-seed] ✓ Un-dismissed ${keepEvents.length} breeding events for demo`)
  }

  console.log('[sheep-video-seed] ✅ Done!')
  await knex.destroy()
}

main().catch(async (err) => {
  console.error('[sheep-video-seed] FATAL:', err)
  await knex.destroy()
  process.exit(1) // eslint-disable-line n/no-process-exit
})
