exports.up = function (knex) {
  return knex.schema
    .table('milk_records', (table) => {
      table.index('recording_date', 'idx_milk_records_recording_date')
      table.index('milk_discarded', 'idx_milk_records_milk_discarded')
    })
    .table('breeding_events', (table) => {
      table.index('expected_preg_check', 'idx_breeding_events_expected_preg_check')
      table.index('expected_dry_off', 'idx_breeding_events_expected_dry_off')
      table.index('dismissed_at', 'idx_breeding_events_dismissed_at')
    })
    .table('sync_log', (table) => {
      table.index('synced_at', 'idx_sync_log_synced_at')
      table.index('user_id', 'idx_sync_log_user_id')
    })
    .table('audit_log', (table) => {
      table.index('user_id', 'idx_audit_log_user_id')
    })
}

exports.down = function (knex) {
  return knex.schema
    .table('milk_records', (table) => {
      table.dropIndex('recording_date', 'idx_milk_records_recording_date')
      table.dropIndex('milk_discarded', 'idx_milk_records_milk_discarded')
    })
    .table('breeding_events', (table) => {
      table.dropIndex('expected_preg_check', 'idx_breeding_events_expected_preg_check')
      table.dropIndex('expected_dry_off', 'idx_breeding_events_expected_dry_off')
      table.dropIndex('dismissed_at', 'idx_breeding_events_dismissed_at')
    })
    .table('sync_log', (table) => {
      table.dropIndex('synced_at', 'idx_sync_log_synced_at')
      table.dropIndex('user_id', 'idx_sync_log_user_id')
    })
    .table('audit_log', (table) => {
      table.dropIndex('user_id', 'idx_audit_log_user_id')
    })
}
