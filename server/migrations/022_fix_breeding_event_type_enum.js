/**
 * Migration 022: Add 'dry_off' to breeding_events.event_type enum
 *
 * SQLite implements Knex enum() as a CHECK constraint which can't be altered —
 * we must recreate the table to expand the allowed values.
 *
 * MySQL: uses ALTER TABLE ... MODIFY COLUMN to expand the ENUM in-place.
 */

// Must opt out of Knex transaction wrapping so we can manage SQLite atomicity
// manually and avoid MySQL DDL implicit-commit interfering with a Knex wrapper.
exports.config = { transaction: false }

const COLUMNS = [
  'id', 'cow_id', 'event_type', 'event_date', 'sire_id', 'semen_id',
  'inseminator', 'heat_signs', 'preg_check_method', 'calving_details',
  'cost', 'expected_next_heat', 'expected_preg_check', 'expected_calving',
  'expected_dry_off', 'notes', 'recorded_by', 'created_at', 'updated_at',
  'synced_at', 'dismissed_at', 'dismissed_by', 'dismiss_reason',
]

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  if (isSQLite) {
    // SQLite: recreate table with expanded CHECK constraint to include 'dry_off'
    await knex.raw('PRAGMA foreign_keys = OFF')
    await knex.raw('BEGIN')
    try {
      await knex.raw(`
        CREATE TABLE breeding_events_new (
          id VARCHAR(36) PRIMARY KEY,
          cow_id VARCHAR(36) NOT NULL REFERENCES cows(id),
          event_type VARCHAR(255) NOT NULL CHECK (event_type IN (
            'heat_observed', 'ai_insemination', 'bull_service',
            'preg_check_positive', 'preg_check_negative',
            'calving', 'abortion', 'dry_off'
          )),
          event_date TIMESTAMP NOT NULL,
          sire_id VARCHAR(36) REFERENCES cows(id),
          semen_id VARCHAR(255),
          inseminator VARCHAR(255),
          heat_signs TEXT,
          preg_check_method VARCHAR(255),
          calving_details TEXT,
          cost DECIMAL(10,2),
          expected_next_heat DATE,
          expected_preg_check DATE,
          expected_calving DATE,
          expected_dry_off DATE,
          notes TEXT,
          recorded_by VARCHAR(36) REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          synced_at TIMESTAMP,
          dismissed_at TIMESTAMP,
          dismissed_by VARCHAR(36) REFERENCES users(id),
          dismiss_reason VARCHAR(500)
        )
      `)

      const cols = COLUMNS.join(', ')
      await knex.raw(`INSERT INTO breeding_events_new (${cols}) SELECT ${cols} FROM breeding_events`)
      await knex.raw('DROP TABLE breeding_events')
      await knex.raw('ALTER TABLE breeding_events_new RENAME TO breeding_events')

      // Recreate indexes from migration 015 plus event_date (predates migration 027's alias)
      await knex.raw('CREATE INDEX breeding_events_cow_id_index ON breeding_events(cow_id)')
      await knex.raw('CREATE INDEX breeding_events_event_type_index ON breeding_events(event_type)')
      await knex.raw('CREATE INDEX breeding_events_event_date_index ON breeding_events(event_date)')
      await knex.raw('CREATE INDEX breeding_events_expected_calving_index ON breeding_events(expected_calving)')
      await knex.raw('CREATE INDEX breeding_events_expected_next_heat_index ON breeding_events(expected_next_heat)')

      await knex.raw('COMMIT')
      await knex.raw('PRAGMA foreign_keys = ON')
    } catch (err) {
      await knex.raw('ROLLBACK')
      await knex.raw('PRAGMA foreign_keys = ON')
      throw err
    }
  } else {
    // MySQL: simply expand the ENUM column to include 'dry_off'
    await knex.raw(`
      ALTER TABLE breeding_events MODIFY COLUMN event_type
      ENUM(
        'heat_observed', 'ai_insemination', 'bull_service',
        'preg_check_positive', 'preg_check_negative',
        'calving', 'abortion', 'dry_off'
      ) NOT NULL
    `)
  }
}

exports.down = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  if (isSQLite) {
    // SQLite: remove dry_off events then recreate table with original CHECK constraint.
    // Both the delete and the recreation are inside the transaction so a partial failure
    // does not permanently destroy dry_off rows.
    await knex.raw('PRAGMA foreign_keys = OFF')
    await knex.raw('BEGIN')
    try {
      await knex('breeding_events').where('event_type', 'dry_off').del()

      await knex.raw(`
        CREATE TABLE breeding_events_old (
          id VARCHAR(36) PRIMARY KEY,
          cow_id VARCHAR(36) NOT NULL REFERENCES cows(id),
          event_type VARCHAR(255) NOT NULL CHECK (event_type IN (
            'heat_observed', 'ai_insemination', 'bull_service',
            'preg_check_positive', 'preg_check_negative',
            'calving', 'abortion'
          )),
          event_date TIMESTAMP NOT NULL,
          sire_id VARCHAR(36) REFERENCES cows(id),
          semen_id VARCHAR(255),
          inseminator VARCHAR(255),
          heat_signs TEXT,
          preg_check_method VARCHAR(255),
          calving_details TEXT,
          cost DECIMAL(10,2),
          expected_next_heat DATE,
          expected_preg_check DATE,
          expected_calving DATE,
          expected_dry_off DATE,
          notes TEXT,
          recorded_by VARCHAR(36) REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          synced_at TIMESTAMP,
          dismissed_at TIMESTAMP,
          dismissed_by VARCHAR(36) REFERENCES users(id),
          dismiss_reason VARCHAR(500)
        )
      `)

      const cols = COLUMNS.join(', ')
      await knex.raw(`INSERT INTO breeding_events_old (${cols}) SELECT ${cols} FROM breeding_events`)
      await knex.raw('DROP TABLE breeding_events')
      await knex.raw('ALTER TABLE breeding_events_old RENAME TO breeding_events')

      await knex.raw('CREATE INDEX breeding_events_cow_id_index ON breeding_events(cow_id)')
      await knex.raw('CREATE INDEX breeding_events_event_type_index ON breeding_events(event_type)')
      await knex.raw('CREATE INDEX breeding_events_event_date_index ON breeding_events(event_date)')
      await knex.raw('CREATE INDEX breeding_events_expected_calving_index ON breeding_events(expected_calving)')
      await knex.raw('CREATE INDEX breeding_events_expected_next_heat_index ON breeding_events(expected_next_heat)')

      await knex.raw('COMMIT')
      await knex.raw('PRAGMA foreign_keys = ON')
    } catch (err) {
      await knex.raw('ROLLBACK')
      await knex.raw('PRAGMA foreign_keys = ON')
      throw err
    }
  } else {
    // MySQL: delete dry_off rows then shrink ENUM back to original values
    await knex('breeding_events').where('event_type', 'dry_off').del()
    await knex.raw(`
      ALTER TABLE breeding_events MODIFY COLUMN event_type
      ENUM(
        'heat_observed', 'ai_insemination', 'bull_service',
        'preg_check_positive', 'preg_check_negative',
        'calving', 'abortion'
      ) NOT NULL
    `)
  }
}
