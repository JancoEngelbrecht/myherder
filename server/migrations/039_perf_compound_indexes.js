/**
 * Migration 039: Compound performance indexes
 *
 * Adds compound indexes for the four hottest query patterns:
 *
 *   1. animals(farm_id, deleted_at, status)          — GET /api/animals list
 *      filter: farm_id + deleted_at IS NULL + optional status
 *
 *   2. health_issues(farm_id, status)                — GET /api/analytics/daily-kpis
 *      open-issue count fires on every dashboard load
 *
 *   3. breeding_events(farm_id, dismissed_at, expected_next_heat)
 *   4. breeding_events(farm_id, dismissed_at, expected_preg_check)
 *   5. breeding_events(farm_id, dismissed_at, expected_calving)
 *   6. breeding_events(farm_id, dismissed_at, expected_dry_off)
 *      GET /api/breeding-events/upcoming fires 4 parallel queries on these columns
 *
 *   7. treatments(farm_id, withdrawal_end_milk)       — GET /api/treatments/withdrawal
 *   8. treatments(farm_id, withdrawal_end_meat)         runs on every milk recording page load
 *
 * All single-column farm_id indexes already exist from migration 030.
 * These compound indexes add the second/third columns to support index range scans.
 *
 * SQLite + MySQL portable — uses Knex table.index() which emits CREATE INDEX.
 * No MySQL-specific syntax used.
 */

// ── up ────────────────────────────────────────────────────────────────────────

exports.up = function (knex) {
  return knex.schema
    .table('animals', (table) => {
      table.index(['farm_id', 'deleted_at', 'status'], 'idx_animals_farm_deleted_status')
    })
    .table('health_issues', (table) => {
      table.index(['farm_id', 'status'], 'idx_health_issues_farm_status')
    })
    .table('breeding_events', (table) => {
      table.index(['farm_id', 'dismissed_at', 'expected_next_heat'], 'idx_be_farm_dismissed_heat')
      table.index(
        ['farm_id', 'dismissed_at', 'expected_preg_check'],
        'idx_be_farm_dismissed_preg_check'
      )
      table.index(['farm_id', 'dismissed_at', 'expected_calving'], 'idx_be_farm_dismissed_calving')
      table.index(['farm_id', 'dismissed_at', 'expected_dry_off'], 'idx_be_farm_dismissed_dry_off')
    })
    .table('treatments', (table) => {
      table.index(['farm_id', 'withdrawal_end_milk'], 'idx_treatments_farm_wh_milk')
      table.index(['farm_id', 'withdrawal_end_meat'], 'idx_treatments_farm_wh_meat')
    })
}

// ── down ──────────────────────────────────────────────────────────────────────

exports.down = function (knex) {
  return knex.schema
    .table('animals', (table) => {
      table.dropIndex(['farm_id', 'deleted_at', 'status'], 'idx_animals_farm_deleted_status')
    })
    .table('health_issues', (table) => {
      table.dropIndex(['farm_id', 'status'], 'idx_health_issues_farm_status')
    })
    .table('breeding_events', (table) => {
      table.dropIndex(
        ['farm_id', 'dismissed_at', 'expected_next_heat'],
        'idx_be_farm_dismissed_heat'
      )
      table.dropIndex(
        ['farm_id', 'dismissed_at', 'expected_preg_check'],
        'idx_be_farm_dismissed_preg_check'
      )
      table.dropIndex(
        ['farm_id', 'dismissed_at', 'expected_calving'],
        'idx_be_farm_dismissed_calving'
      )
      table.dropIndex(
        ['farm_id', 'dismissed_at', 'expected_dry_off'],
        'idx_be_farm_dismissed_dry_off'
      )
    })
    .table('treatments', (table) => {
      table.dropIndex(['farm_id', 'withdrawal_end_milk'], 'idx_treatments_farm_wh_milk')
      table.dropIndex(['farm_id', 'withdrawal_end_meat'], 'idx_treatments_farm_wh_meat')
    })
}
