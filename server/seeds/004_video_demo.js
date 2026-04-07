const { v4: uuidv4 } = require('uuid')

const DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099'

/**
 * Video demo seed — layers demo-specific tweaks on top of seeds 001-003.
 * - Grants sipho `can_record_milk` so worker section shows milk recording.
 * - Ensures 3 open/treating health issues exist for the demo.
 *
 * Safe to re-run: uses UPDATE/upsert patterns.
 */
exports.seed = async function (knex) {
  // ── Update sipho's permissions to include milk recording ────────────────
  const sipho = await knex('users').where('username', 'sipho').first()
  if (sipho) {
    let perms = []
    try {
      perms = JSON.parse(sipho.permissions || '[]')
    } catch {
      perms = []
    }
    if (!perms.includes('can_record_milk')) {
      perms.push('can_record_milk')
      await knex('users')
        .where('id', sipho.id)
        .update({ permissions: JSON.stringify(perms) })
    }
  }

  // ── Ensure open health issues exist for the demo ────────────────────────
  const admin = await knex('users').where('username', 'admin').first()
  if (!admin) return

  // Get some cows to attach issues to
  const cows = await knex('animals')
    .where('farm_id', DEFAULT_FARM_ID)
    .whereNull('deleted_at')
    .where('sex', 'female')
    .whereIn('tag_number', ['C006', 'C007', 'C015'])
    .select('id', 'tag_number')

  if (cows.length === 0) return

  const now = new Date()
  function daysAgo(n) {
    const d = new Date(now)
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 19).replace('T', ' ')
  }

  // Check if we already have recent open issues (avoid duplicates on re-run)
  const recentOpen = await knex('health_issues')
    .where('farm_id', DEFAULT_FARM_ID)
    .where('status', 'open')
    .count('* as cnt')
  const openCount = Number(recentOpen[0].cnt)

  if (openCount < 2) {
    const demoIssues = [
      {
        id: uuidv4(),
        farm_id: DEFAULT_FARM_ID,
        animal_id: cows[0]?.id,
        reported_by: admin.id,
        issue_types: JSON.stringify(['lameness']),
        severity: 'medium',
        affected_teats: null,
        description: 'Left rear hoof swollen, limping since yesterday.',
        observed_at: daysAgo(1),
        status: 'open',
        resolved_at: null,
        created_at: daysAgo(1),
        updated_at: daysAgo(1),
      },
      {
        id: uuidv4(),
        farm_id: DEFAULT_FARM_ID,
        animal_id: cows[1]?.id || cows[0]?.id,
        reported_by: admin.id,
        issue_types: JSON.stringify(['mastitis']),
        severity: 'high',
        affected_teats: JSON.stringify(['front_left']),
        description: 'Swelling in front left quarter, milk clots observed.',
        observed_at: daysAgo(2),
        status: 'treating',
        resolved_at: null,
        created_at: daysAgo(2),
        updated_at: daysAgo(1),
      },
      {
        id: uuidv4(),
        farm_id: DEFAULT_FARM_ID,
        animal_id: cows[2]?.id || cows[0]?.id,
        reported_by: sipho?.id || admin.id,
        issue_types: JSON.stringify(['eye']),
        severity: 'low',
        affected_teats: null,
        description: 'Tearing in right eye, possible fly irritation.',
        observed_at: daysAgo(3),
        status: 'open',
        resolved_at: null,
        created_at: daysAgo(3),
        updated_at: daysAgo(3),
      },
    ]

    await knex('health_issues').insert(demoIssues)
  }

  // ── Dismiss ALL breeding events, then un-dismiss exactly 2 ──────────────
  // This ensures a clean notifications page regardless of when the seed runs.
  const nowTs = new Date()

  // Step 1: Dismiss every breeding event on this farm
  await knex('breeding_events')
    .where('farm_id', DEFAULT_FARM_ID)
    .whereNull('dismissed_at')
    .update({ dismissed_at: nowTs })

  // Step 2: Un-dismiss exactly 2 events so the demo has something to show
  // Pick 2 different notification types for visual variety
  const keepEvents = await knex('breeding_events')
    .where('farm_id', DEFAULT_FARM_ID)
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
  }
}
