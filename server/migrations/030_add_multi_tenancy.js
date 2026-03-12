/**
 * Migration 030: Add multi-tenancy schema
 *
 * Creates `farms` table, adds `farm_id NOT NULL` to all 13 tenant-scoped tables,
 * updates unique constraints, adds `token_version` to users, expands role CHECK
 * to include 'super_admin', and creates farm_id indexes.
 *
 * SQLite requires table recreation to add NOT NULL columns. MySQL uses ALTER TABLE.
 */

// Must opt out of Knex transaction wrapping so PRAGMA foreign_keys = OFF works
exports.config = { transaction: false }

const DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099'

// ── Table schemas (Appendix B from plan) ───────────────────────────────────

const TABLE_SCHEMAS = {
  users: {
    create: `CREATE TABLE users (
  id char(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  username varchar(255) NOT NULL,
  pin_hash varchar(255),
  password_hash varchar(255),
  full_name varchar(255) NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'worker', 'super_admin')) DEFAULT 'worker',
  permissions json DEFAULT '[]',
  language varchar(255) DEFAULT 'en',
  is_active boolean DEFAULT '1',
  failed_attempts integer DEFAULT '0',
  locked_until datetime,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at datetime NULL DEFAULT NULL,
  token_version INTEGER NOT NULL DEFAULT 0,
  UNIQUE(farm_id, username)
)`,
    columns: [
      'id', 'farm_id', 'username', 'pin_hash', 'password_hash', 'full_name',
      'role', 'permissions', 'language', 'is_active', 'failed_attempts',
      'locked_until', 'created_at', 'updated_at', 'deleted_at', 'token_version',
    ],
    indexes: [
      'CREATE INDEX idx_users_updated_at ON users(updated_at)',
    ],
  },

  cows: {
    create: `CREATE TABLE cows (
  id char(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  tag_number varchar(255) NOT NULL,
  name varchar(255),
  dob date,
  breed varchar(255),
  sex text NOT NULL CHECK (sex IN ('female', 'male')) DEFAULT 'female',
  status text NOT NULL CHECK (status IN ('active', 'dry', 'pregnant', 'sick', 'sold', 'dead')) DEFAULT 'active',
  sire_id char(36) REFERENCES cows(id),
  dam_id char(36) REFERENCES cows(id),
  notes text,
  created_by char(36) REFERENCES users(id),
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at datetime,
  breed_type_id varchar(36) NULL REFERENCES breed_types(id),
  is_external boolean NOT NULL DEFAULT '0',
  purpose varchar(30) NULL,
  life_phase_override varchar(30) NULL,
  is_dry boolean NOT NULL DEFAULT '0',
  status_changed_at datetime NULL,
  UNIQUE(farm_id, tag_number)
)`,
    columns: [
      'id', 'farm_id', 'tag_number', 'name', 'dob', 'breed', 'sex', 'status',
      'sire_id', 'dam_id', 'notes', 'created_by', 'created_at', 'updated_at',
      'deleted_at', 'breed_type_id', 'is_external', 'purpose',
      'life_phase_override', 'is_dry', 'status_changed_at',
    ],
    indexes: [
      'CREATE INDEX cows_sire_id_index ON cows(sire_id)',
      'CREATE INDEX cows_dam_id_index ON cows(dam_id)',
      'CREATE INDEX cows_status_index ON cows(status)',
      'CREATE INDEX cows_created_by_index ON cows(created_by)',
      'CREATE INDEX cows_deleted_at_index ON cows(deleted_at)',
      'CREATE INDEX idx_cows_updated_at ON cows(updated_at)',
    ],
  },

  medications: {
    create: `CREATE TABLE medications (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  name varchar(100) NOT NULL,
  active_ingredient varchar(100),
  withdrawal_milk_hours integer NOT NULL DEFAULT '0',
  withdrawal_meat_days integer NOT NULL DEFAULT '0',
  default_dosage varchar(100),
  unit varchar(20),
  notes text,
  is_active boolean NOT NULL DEFAULT '1',
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  withdrawal_milk_days integer NOT NULL DEFAULT '0',
  withdrawal_meat_hours integer NOT NULL DEFAULT '0'
)`,
    columns: [
      'id', 'farm_id', 'name', 'active_ingredient', 'withdrawal_milk_hours',
      'withdrawal_meat_days', 'default_dosage', 'unit', 'notes', 'is_active',
      'created_at', 'updated_at', 'withdrawal_milk_days', 'withdrawal_meat_hours',
    ],
    indexes: [
      'CREATE INDEX idx_medications_updated_at ON medications(updated_at)',
    ],
  },

  treatments: {
    create: `CREATE TABLE treatments (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  cow_id varchar(36) NOT NULL REFERENCES cows(id),
  medication_id varchar(36) NOT NULL REFERENCES medications(id),
  administered_by varchar(36) NOT NULL REFERENCES users(id),
  dosage varchar(50),
  cost float,
  treatment_date datetime NOT NULL,
  withdrawal_end_milk datetime,
  withdrawal_end_meat datetime,
  is_vet_visit boolean NOT NULL DEFAULT '0',
  vet_name varchar(100),
  notes text,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  synced_at datetime NULL,
  health_issue_id varchar(36) NULL REFERENCES health_issues(id)
)`,
    columns: [
      'id', 'farm_id', 'cow_id', 'medication_id', 'administered_by', 'dosage',
      'cost', 'treatment_date', 'withdrawal_end_milk', 'withdrawal_end_meat',
      'is_vet_visit', 'vet_name', 'notes', 'created_at', 'updated_at',
      'synced_at', 'health_issue_id',
    ],
    indexes: [
      'CREATE INDEX idx_treatments_cow_withdrawal ON treatments(cow_id, withdrawal_end_milk)',
      'CREATE INDEX idx_treatments_treatment_date ON treatments(treatment_date)',
      'CREATE INDEX idx_treatments_updated_at ON treatments(updated_at)',
    ],
  },

  health_issues: {
    create: `CREATE TABLE health_issues (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  cow_id varchar(36) NOT NULL REFERENCES cows(id),
  reported_by varchar(36) NOT NULL REFERENCES users(id),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')) DEFAULT 'medium',
  affected_teats json NULL,
  description text,
  observed_at datetime NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'treating', 'resolved')) DEFAULT 'open',
  resolved_at datetime NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  synced_at datetime NULL,
  issue_types text NULL
)`,
    columns: [
      'id', 'farm_id', 'cow_id', 'reported_by', 'severity', 'affected_teats',
      'description', 'observed_at', 'status', 'resolved_at', 'created_at',
      'updated_at', 'synced_at', 'issue_types',
    ],
    indexes: [
      'CREATE INDEX health_issues_cow_id_index ON health_issues(cow_id)',
      'CREATE INDEX health_issues_status_index ON health_issues(status)',
      'CREATE INDEX health_issues_observed_at_index ON health_issues(observed_at)',
      'CREATE INDEX idx_health_issues_updated_at ON health_issues(updated_at)',
    ],
  },

  health_issue_comments: {
    create: `CREATE TABLE health_issue_comments (
  id char(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  health_issue_id char(36) NOT NULL REFERENCES health_issues(id) ON DELETE CASCADE,
  user_id char(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL
)`,
    columns: [
      'id', 'farm_id', 'health_issue_id', 'user_id', 'comment',
      'created_at', 'updated_at',
    ],
    indexes: [
      'CREATE INDEX health_issue_comments_health_issue_id_index ON health_issue_comments(health_issue_id)',
    ],
  },

  milk_records: {
    create: `CREATE TABLE milk_records (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  cow_id varchar(36) NOT NULL REFERENCES cows(id),
  recorded_by varchar(36) NOT NULL REFERENCES users(id),
  session text NOT NULL CHECK (session IN ('morning', 'afternoon', 'evening')),
  litres float NOT NULL,
  recording_date date NOT NULL,
  milk_discarded boolean NOT NULL DEFAULT '0',
  discard_reason varchar(255) NULL,
  notes text NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  synced_at datetime NULL,
  session_time varchar(5) NULL,
  UNIQUE(farm_id, cow_id, session, recording_date)
)`,
    columns: [
      'id', 'farm_id', 'cow_id', 'recorded_by', 'session', 'litres',
      'recording_date', 'milk_discarded', 'discard_reason', 'notes',
      'created_at', 'updated_at', 'synced_at', 'session_time',
    ],
    indexes: [
      'CREATE INDEX idx_milk_records_recording_date ON milk_records(recording_date)',
      'CREATE INDEX idx_milk_records_milk_discarded ON milk_records(milk_discarded)',
      'CREATE INDEX idx_milk_records_updated_at ON milk_records(updated_at)',
    ],
  },

  breeding_events: {
    create: `CREATE TABLE breeding_events (
  id VARCHAR(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
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
)`,
    columns: [
      'id', 'farm_id', 'cow_id', 'event_type', 'event_date', 'sire_id',
      'semen_id', 'inseminator', 'heat_signs', 'preg_check_method',
      'calving_details', 'cost', 'expected_next_heat', 'expected_preg_check',
      'expected_calving', 'expected_dry_off', 'notes', 'recorded_by',
      'created_at', 'updated_at', 'synced_at', 'dismissed_at', 'dismissed_by',
      'dismiss_reason',
    ],
    indexes: [
      'CREATE INDEX breeding_events_cow_id_index ON breeding_events(cow_id)',
      'CREATE INDEX breeding_events_event_type_index ON breeding_events(event_type)',
      'CREATE INDEX breeding_events_event_date_index ON breeding_events(event_date)',
      'CREATE INDEX breeding_events_expected_calving_index ON breeding_events(expected_calving)',
      'CREATE INDEX breeding_events_expected_next_heat_index ON breeding_events(expected_next_heat)',
      'CREATE INDEX idx_breeding_events_expected_preg_check ON breeding_events(expected_preg_check)',
      'CREATE INDEX idx_breeding_events_expected_dry_off ON breeding_events(expected_dry_off)',
      'CREATE INDEX idx_breeding_events_dismissed_at ON breeding_events(dismissed_at)',
      'CREATE INDEX idx_breeding_events_updated_at ON breeding_events(updated_at)',
    ],
  },

  breed_types: {
    create: `CREATE TABLE breed_types (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  code varchar(50) NOT NULL,
  name varchar(100) NOT NULL,
  heat_cycle_days integer NOT NULL DEFAULT '21',
  gestation_days integer NOT NULL DEFAULT '283',
  preg_check_days integer NOT NULL DEFAULT '35',
  voluntary_waiting_days integer NOT NULL DEFAULT '45',
  dry_off_days integer NOT NULL DEFAULT '60',
  calf_max_months integer NOT NULL DEFAULT '6',
  heifer_min_months integer NOT NULL DEFAULT '15',
  young_bull_min_months integer NOT NULL DEFAULT '15',
  is_active boolean NOT NULL DEFAULT '1',
  sort_order integer NOT NULL DEFAULT '0',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(farm_id, code)
)`,
    columns: [
      'id', 'farm_id', 'code', 'name', 'heat_cycle_days', 'gestation_days',
      'preg_check_days', 'voluntary_waiting_days', 'dry_off_days',
      'calf_max_months', 'heifer_min_months', 'young_bull_min_months',
      'is_active', 'sort_order', 'created_at', 'updated_at',
    ],
    indexes: [
      'CREATE INDEX idx_breed_types_updated_at ON breed_types(updated_at)',
    ],
  },

  issue_type_definitions: {
    create: `CREATE TABLE issue_type_definitions (
  id char(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  code varchar(50) NOT NULL,
  name varchar(100) NOT NULL,
  emoji varchar(10) NOT NULL DEFAULT '?',
  requires_teat_selection boolean NOT NULL DEFAULT '0',
  is_active boolean NOT NULL DEFAULT '1',
  sort_order integer NOT NULL DEFAULT '0',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(farm_id, code)
)`,
    columns: [
      'id', 'farm_id', 'code', 'name', 'emoji', 'requires_teat_selection',
      'is_active', 'sort_order', 'created_at', 'updated_at',
    ],
    indexes: [
      'CREATE INDEX idx_issue_type_definitions_updated_at ON issue_type_definitions(updated_at)',
    ],
  },

  feature_flags: {
    create: `CREATE TABLE feature_flags (
  farm_id TEXT NOT NULL REFERENCES farms(id),
  key varchar(50) NOT NULL,
  enabled boolean NOT NULL DEFAULT '1',
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (farm_id, key)
)`,
    columns: ['farm_id', 'key', 'enabled', 'updated_at'],
    indexes: [],
  },

  app_settings: {
    create: `CREATE TABLE app_settings (
  farm_id TEXT NOT NULL REFERENCES farms(id),
  key VARCHAR(50) NOT NULL,
  value TEXT,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (farm_id, key)
)`,
    columns: ['farm_id', 'key', 'value', 'updated_at'],
    indexes: [],
  },

  audit_log: {
    create: `CREATE TABLE audit_log (
  id varchar(36) PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  user_id varchar(36) REFERENCES users(id),
  action varchar(50) NOT NULL,
  entity_type varchar(50),
  entity_id varchar(36),
  old_values text,
  new_values text,
  created_at datetime DEFAULT CURRENT_TIMESTAMP
)`,
    columns: [
      'id', 'farm_id', 'user_id', 'action', 'entity_type', 'entity_id',
      'old_values', 'new_values', 'created_at',
    ],
    indexes: [
      'CREATE INDEX audit_log_entity_type_entity_id_index ON audit_log(entity_type, entity_id)',
      'CREATE INDEX audit_log_created_at_index ON audit_log(created_at)',
      'CREATE INDEX idx_audit_log_user_id ON audit_log(user_id)',
    ],
  },
}

// New farm_id indexes (created after all table recreations)
const FARM_ID_INDEXES = [
  'CREATE INDEX idx_users_farm_id ON users(farm_id)',
  'CREATE INDEX idx_cows_farm_id ON cows(farm_id)',
  'CREATE INDEX idx_medications_farm_id ON medications(farm_id)',
  'CREATE INDEX idx_treatments_farm_id ON treatments(farm_id)',
  'CREATE INDEX idx_health_issues_farm_id ON health_issues(farm_id)',
  'CREATE INDEX idx_health_issue_comments_farm_id ON health_issue_comments(farm_id)',
  'CREATE INDEX idx_milk_records_farm_id ON milk_records(farm_id)',
  'CREATE INDEX idx_breeding_events_farm_id ON breeding_events(farm_id)',
  'CREATE INDEX idx_breed_types_farm_id ON breed_types(farm_id)',
  'CREATE INDEX idx_issue_type_definitions_farm_id ON issue_type_definitions(farm_id)',
  'CREATE INDEX idx_audit_log_farm_id ON audit_log(farm_id)',
  // Compound indexes for common query patterns
  'CREATE INDEX idx_cows_farm_status ON cows(farm_id, status)',
  'CREATE INDEX idx_milk_records_farm_date ON milk_records(farm_id, recording_date)',
  'CREATE INDEX idx_breeding_events_farm_date ON breeding_events(farm_id, event_date)',
  'CREATE INDEX idx_health_issues_farm_observed ON health_issues(farm_id, observed_at)',
  'CREATE INDEX idx_treatments_farm_date ON treatments(farm_id, treatment_date)',
]

// ── Rollback schemas (original tables WITHOUT farm_id/token_version) ───────

const ROLLBACK_SCHEMAS = {
  users: {
    create: `CREATE TABLE users (
  id char(36) PRIMARY KEY,
  username varchar(255) NOT NULL UNIQUE,
  pin_hash varchar(255),
  password_hash varchar(255),
  full_name varchar(255) NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'worker')) DEFAULT 'worker',
  permissions json DEFAULT '[]',
  language varchar(255) DEFAULT 'en',
  is_active boolean DEFAULT '1',
  failed_attempts integer DEFAULT '0',
  locked_until datetime,
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at datetime NULL DEFAULT NULL
)`,
    columns: [
      'id', 'username', 'pin_hash', 'password_hash', 'full_name',
      'role', 'permissions', 'language', 'is_active', 'failed_attempts',
      'locked_until', 'created_at', 'updated_at', 'deleted_at',
    ],
    indexes: [
      'CREATE INDEX idx_users_updated_at ON users(updated_at)',
    ],
  },

  cows: {
    create: `CREATE TABLE cows (
  id char(36) PRIMARY KEY,
  tag_number varchar(255) NOT NULL UNIQUE,
  name varchar(255),
  dob date,
  breed varchar(255),
  sex text NOT NULL CHECK (sex IN ('female', 'male')) DEFAULT 'female',
  status text NOT NULL CHECK (status IN ('active', 'dry', 'pregnant', 'sick', 'sold', 'dead')) DEFAULT 'active',
  sire_id char(36) REFERENCES cows(id),
  dam_id char(36) REFERENCES cows(id),
  notes text,
  created_by char(36) REFERENCES users(id),
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at datetime,
  breed_type_id varchar(36) NULL REFERENCES breed_types(id),
  is_external boolean NOT NULL DEFAULT '0',
  purpose varchar(30) NULL,
  life_phase_override varchar(30) NULL,
  is_dry boolean NOT NULL DEFAULT '0',
  status_changed_at datetime NULL
)`,
    columns: [
      'id', 'tag_number', 'name', 'dob', 'breed', 'sex', 'status',
      'sire_id', 'dam_id', 'notes', 'created_by', 'created_at', 'updated_at',
      'deleted_at', 'breed_type_id', 'is_external', 'purpose',
      'life_phase_override', 'is_dry', 'status_changed_at',
    ],
    indexes: [
      'CREATE INDEX cows_sire_id_index ON cows(sire_id)',
      'CREATE INDEX cows_dam_id_index ON cows(dam_id)',
      'CREATE INDEX cows_status_index ON cows(status)',
      'CREATE INDEX cows_created_by_index ON cows(created_by)',
      'CREATE INDEX cows_deleted_at_index ON cows(deleted_at)',
      'CREATE INDEX idx_cows_updated_at ON cows(updated_at)',
    ],
  },

  medications: {
    create: `CREATE TABLE medications (
  id varchar(36) PRIMARY KEY,
  name varchar(100) NOT NULL,
  active_ingredient varchar(100),
  withdrawal_milk_hours integer NOT NULL DEFAULT '0',
  withdrawal_meat_days integer NOT NULL DEFAULT '0',
  default_dosage varchar(100),
  unit varchar(20),
  notes text,
  is_active boolean NOT NULL DEFAULT '1',
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  withdrawal_milk_days integer NOT NULL DEFAULT '0',
  withdrawal_meat_hours integer NOT NULL DEFAULT '0'
)`,
    columns: [
      'id', 'name', 'active_ingredient', 'withdrawal_milk_hours',
      'withdrawal_meat_days', 'default_dosage', 'unit', 'notes', 'is_active',
      'created_at', 'updated_at', 'withdrawal_milk_days', 'withdrawal_meat_hours',
    ],
    indexes: [
      'CREATE INDEX idx_medications_updated_at ON medications(updated_at)',
    ],
  },

  treatments: {
    create: `CREATE TABLE treatments (
  id varchar(36) PRIMARY KEY,
  cow_id varchar(36) NOT NULL REFERENCES cows(id),
  medication_id varchar(36) NOT NULL REFERENCES medications(id),
  administered_by varchar(36) NOT NULL REFERENCES users(id),
  dosage varchar(50),
  cost float,
  treatment_date datetime NOT NULL,
  withdrawal_end_milk datetime,
  withdrawal_end_meat datetime,
  is_vet_visit boolean NOT NULL DEFAULT '0',
  vet_name varchar(100),
  notes text,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  synced_at datetime NULL,
  health_issue_id varchar(36) NULL REFERENCES health_issues(id)
)`,
    columns: [
      'id', 'cow_id', 'medication_id', 'administered_by', 'dosage',
      'cost', 'treatment_date', 'withdrawal_end_milk', 'withdrawal_end_meat',
      'is_vet_visit', 'vet_name', 'notes', 'created_at', 'updated_at',
      'synced_at', 'health_issue_id',
    ],
    indexes: [
      'CREATE INDEX idx_treatments_cow_withdrawal ON treatments(cow_id, withdrawal_end_milk)',
      'CREATE INDEX idx_treatments_treatment_date ON treatments(treatment_date)',
      'CREATE INDEX idx_treatments_updated_at ON treatments(updated_at)',
    ],
  },

  health_issues: {
    create: `CREATE TABLE health_issues (
  id varchar(36) PRIMARY KEY,
  cow_id varchar(36) NOT NULL REFERENCES cows(id),
  reported_by varchar(36) NOT NULL REFERENCES users(id),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high')) DEFAULT 'medium',
  affected_teats json NULL,
  description text,
  observed_at datetime NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'treating', 'resolved')) DEFAULT 'open',
  resolved_at datetime NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  synced_at datetime NULL,
  issue_types text NULL
)`,
    columns: [
      'id', 'cow_id', 'reported_by', 'severity', 'affected_teats',
      'description', 'observed_at', 'status', 'resolved_at', 'created_at',
      'updated_at', 'synced_at', 'issue_types',
    ],
    indexes: [
      'CREATE INDEX health_issues_cow_id_index ON health_issues(cow_id)',
      'CREATE INDEX health_issues_status_index ON health_issues(status)',
      'CREATE INDEX health_issues_observed_at_index ON health_issues(observed_at)',
      'CREATE INDEX idx_health_issues_updated_at ON health_issues(updated_at)',
    ],
  },

  health_issue_comments: {
    create: `CREATE TABLE health_issue_comments (
  id char(36) PRIMARY KEY,
  health_issue_id char(36) NOT NULL REFERENCES health_issues(id) ON DELETE CASCADE,
  user_id char(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment text NOT NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL
)`,
    columns: [
      'id', 'health_issue_id', 'user_id', 'comment', 'created_at', 'updated_at',
    ],
    indexes: [
      'CREATE INDEX health_issue_comments_health_issue_id_index ON health_issue_comments(health_issue_id)',
    ],
  },

  milk_records: {
    create: `CREATE TABLE milk_records (
  id varchar(36) PRIMARY KEY,
  cow_id varchar(36) NOT NULL REFERENCES cows(id),
  recorded_by varchar(36) NOT NULL REFERENCES users(id),
  session text NOT NULL CHECK (session IN ('morning', 'afternoon', 'evening')),
  litres float NOT NULL,
  recording_date date NOT NULL,
  milk_discarded boolean NOT NULL DEFAULT '0',
  discard_reason varchar(255) NULL,
  notes text NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP,
  synced_at datetime NULL,
  session_time varchar(5) NULL,
  UNIQUE(cow_id, session, recording_date)
)`,
    columns: [
      'id', 'cow_id', 'recorded_by', 'session', 'litres', 'recording_date',
      'milk_discarded', 'discard_reason', 'notes', 'created_at', 'updated_at',
      'synced_at', 'session_time',
    ],
    indexes: [
      'CREATE INDEX idx_milk_records_recording_date ON milk_records(recording_date)',
      'CREATE INDEX idx_milk_records_milk_discarded ON milk_records(milk_discarded)',
      'CREATE INDEX idx_milk_records_updated_at ON milk_records(updated_at)',
    ],
  },

  breeding_events: {
    create: `CREATE TABLE breeding_events (
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
)`,
    columns: [
      'id', 'cow_id', 'event_type', 'event_date', 'sire_id', 'semen_id',
      'inseminator', 'heat_signs', 'preg_check_method', 'calving_details',
      'cost', 'expected_next_heat', 'expected_preg_check', 'expected_calving',
      'expected_dry_off', 'notes', 'recorded_by', 'created_at', 'updated_at',
      'synced_at', 'dismissed_at', 'dismissed_by', 'dismiss_reason',
    ],
    indexes: [
      'CREATE INDEX breeding_events_cow_id_index ON breeding_events(cow_id)',
      'CREATE INDEX breeding_events_event_type_index ON breeding_events(event_type)',
      'CREATE INDEX breeding_events_event_date_index ON breeding_events(event_date)',
      'CREATE INDEX breeding_events_expected_calving_index ON breeding_events(expected_calving)',
      'CREATE INDEX breeding_events_expected_next_heat_index ON breeding_events(expected_next_heat)',
      'CREATE INDEX idx_breeding_events_expected_preg_check ON breeding_events(expected_preg_check)',
      'CREATE INDEX idx_breeding_events_expected_dry_off ON breeding_events(expected_dry_off)',
      'CREATE INDEX idx_breeding_events_dismissed_at ON breeding_events(dismissed_at)',
      'CREATE INDEX idx_breeding_events_updated_at ON breeding_events(updated_at)',
      // Restore duplicate index that migration 027 created (needed for its rollback)
      'CREATE INDEX idx_breeding_events_event_date ON breeding_events(event_date)',
    ],
  },

  breed_types: {
    create: `CREATE TABLE breed_types (
  id varchar(36) PRIMARY KEY,
  code varchar(50) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  heat_cycle_days integer NOT NULL DEFAULT '21',
  gestation_days integer NOT NULL DEFAULT '283',
  preg_check_days integer NOT NULL DEFAULT '35',
  voluntary_waiting_days integer NOT NULL DEFAULT '45',
  dry_off_days integer NOT NULL DEFAULT '60',
  calf_max_months integer NOT NULL DEFAULT '6',
  heifer_min_months integer NOT NULL DEFAULT '15',
  young_bull_min_months integer NOT NULL DEFAULT '15',
  is_active boolean NOT NULL DEFAULT '1',
  sort_order integer NOT NULL DEFAULT '0',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    columns: [
      'id', 'code', 'name', 'heat_cycle_days', 'gestation_days',
      'preg_check_days', 'voluntary_waiting_days', 'dry_off_days',
      'calf_max_months', 'heifer_min_months', 'young_bull_min_months',
      'is_active', 'sort_order', 'created_at', 'updated_at',
    ],
    indexes: [
      'CREATE INDEX idx_breed_types_updated_at ON breed_types(updated_at)',
    ],
  },

  issue_type_definitions: {
    create: `CREATE TABLE issue_type_definitions (
  id char(36) PRIMARY KEY,
  code varchar(50) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  emoji varchar(10) NOT NULL DEFAULT '?',
  requires_teat_selection boolean NOT NULL DEFAULT '0',
  is_active boolean NOT NULL DEFAULT '1',
  sort_order integer NOT NULL DEFAULT '0',
  created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
    columns: [
      'id', 'code', 'name', 'emoji', 'requires_teat_selection',
      'is_active', 'sort_order', 'created_at', 'updated_at',
    ],
    indexes: [
      'CREATE INDEX idx_issue_type_definitions_updated_at ON issue_type_definitions(updated_at)',
    ],
  },

  feature_flags: {
    create: `CREATE TABLE feature_flags (
  key varchar(50) NOT NULL PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT '1',
  updated_at datetime DEFAULT CURRENT_TIMESTAMP
)`,
    columns: ['key', 'enabled', 'updated_at'],
    indexes: [],
  },

  app_settings: {
    create: `CREATE TABLE app_settings (
  key VARCHAR(50) NOT NULL PRIMARY KEY,
  value TEXT,
  updated_at datetime DEFAULT CURRENT_TIMESTAMP
)`,
    columns: ['key', 'value', 'updated_at'],
    indexes: [],
  },

  audit_log: {
    create: `CREATE TABLE audit_log (
  id varchar(36) PRIMARY KEY,
  user_id varchar(36) REFERENCES users(id),
  action varchar(50) NOT NULL,
  entity_type varchar(50),
  entity_id varchar(36),
  old_values text,
  new_values text,
  created_at datetime DEFAULT CURRENT_TIMESTAMP
)`,
    columns: [
      'id', 'user_id', 'action', 'entity_type', 'entity_id',
      'old_values', 'new_values', 'created_at',
    ],
    indexes: [
      'CREATE INDEX audit_log_entity_type_entity_id_index ON audit_log(entity_type, entity_id)',
      'CREATE INDEX audit_log_created_at_index ON audit_log(created_at)',
      'CREATE INDEX idx_audit_log_user_id ON audit_log(user_id)',
    ],
  },
}

// ── Helper: recreate table with new schema ─────────────────────────────────

async function recreateTable(knex, tableName, schema) {
  const tempName = `${tableName}_new`
  const createSql = schema.create.replace(
    `CREATE TABLE ${tableName}`,
    `CREATE TABLE ${tempName}`
  )

  await knex.raw(createSql)

  const cols = schema.columns.join(', ')
  await knex.raw(`INSERT INTO ${tempName} (${cols}) SELECT ${cols} FROM ${tableName}`)

  await knex.raw(`DROP TABLE ${tableName}`)
  await knex.raw(`ALTER TABLE ${tempName} RENAME TO ${tableName}`)

  for (const idx of schema.indexes) {
    await knex.raw(idx)
  }
}

// ── Recreation order (leaves first, then mid-level, then root/config) ──────

const RECREATION_ORDER = [
  // Phase A: Leaf tables
  'audit_log', 'health_issue_comments', 'milk_records', 'breeding_events', 'treatments',
  // Phase B: Mid-level
  'health_issues',
  // Phase C: Core entity
  'cows',
  // Phase D: Root/lookup
  'users', 'medications', 'breed_types', 'issue_type_definitions',
  // Phase E: Config (PK changes)
  'feature_flags', 'app_settings',
]

// ── UP ─────────────────────────────────────────────────────────────────────

exports.up = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  // 1. Create farms table
  await knex.schema.createTable('farms', (table) => {
    table.string('id', 36).primary()
    table.string('name', 255).notNullable()
    table.string('code', 50).notNullable().unique()
    table.string('slug', 255).notNullable().unique()
    table.boolean('is_active').notNullable().defaultTo(true)
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())
  })

  // 2. Seed default farm (pull farm_name from app_settings if exists)
  let farmName = 'My Farm'
  try {
    const row = await knex('app_settings').where('key', 'farm_name').first()
    if (row && row.value) farmName = row.value
  } catch { /* app_settings may not exist on fresh DB */ }

  await knex('farms').insert({
    id: DEFAULT_FARM_ID,
    name: farmName,
    code: 'DEFAULT',
    slug: 'default',
    is_active: true,
  })

  if (isSQLite) {
    // PRAGMA must be outside any transaction
    await knex.raw('PRAGMA foreign_keys = OFF')

    await knex.raw('BEGIN')
    try {
      // 3. Add nullable farm_id to all tables and backfill
      for (const tableName of RECREATION_ORDER) {
        // For feature_flags and app_settings, farm_id replaces the PK structure.
        // For users, we also add token_version.
        // All handled by the new CREATE TABLE schemas.

        // Add nullable farm_id column (PK changes for config tables handled by recreation)
        await knex.raw(`ALTER TABLE ${tableName} ADD COLUMN farm_id TEXT DEFAULT '${DEFAULT_FARM_ID}'`)

        // Backfill all rows
        await knex.raw(`UPDATE ${tableName} SET farm_id = '${DEFAULT_FARM_ID}' WHERE farm_id IS NULL`)

        // For users, also add token_version before recreation
        if (tableName === 'users') {
          await knex.raw(`ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0`)
          await knex.raw(`UPDATE users SET token_version = 0 WHERE token_version IS NULL`)
        }

        // Recreate with NOT NULL farm_id + updated constraints
        await recreateTable(knex, tableName, TABLE_SCHEMAS[tableName])
      }

      // 4. Create farm_id indexes
      for (const idx of FARM_ID_INDEXES) {
        await knex.raw(idx)
      }

      await knex.raw('COMMIT')
      await knex.raw('PRAGMA foreign_keys = ON')
    } catch (err) {
      await knex.raw('ROLLBACK')
      await knex.raw('PRAGMA foreign_keys = ON')
      throw err
    }
  } else {
    // MySQL branch
    // Disable FK checks so we can drop/replace indexes that MySQL is using as FK support indexes
    await knex.raw('SET FOREIGN_KEY_CHECKS=0')
    try {
      for (const tableName of RECREATION_ORDER) {
        await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN farm_id VARCHAR(36) NOT NULL DEFAULT '${DEFAULT_FARM_ID}'`)
        await knex.raw(`ALTER TABLE \`${tableName}\` ALTER COLUMN farm_id DROP DEFAULT`)
      }

      // Users: add token_version + expand role ENUM
      await knex.raw(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`)
      await knex.raw(`ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'worker', 'super_admin') NOT NULL DEFAULT 'worker'`)

      // Update unique constraints
      await knex.raw('ALTER TABLE users DROP INDEX users_username_unique, ADD UNIQUE INDEX (farm_id, username)')
      await knex.raw('ALTER TABLE cows DROP INDEX cows_tag_number_unique, ADD UNIQUE INDEX (farm_id, tag_number)')
      await knex.raw('ALTER TABLE breed_types DROP INDEX breed_types_code_unique, ADD UNIQUE INDEX (farm_id, code)')
      await knex.raw('ALTER TABLE issue_type_definitions DROP INDEX issue_type_definitions_code_unique, ADD UNIQUE INDEX (farm_id, code)')
      await knex.raw('ALTER TABLE milk_records DROP INDEX milk_records_cow_id_session_recording_date_unique, ADD UNIQUE INDEX (farm_id, cow_id, session, recording_date)')

      // Composite PK changes for config tables
      await knex.raw('ALTER TABLE feature_flags DROP PRIMARY KEY, ADD PRIMARY KEY (farm_id, `key`)')
      await knex.raw('ALTER TABLE app_settings DROP PRIMARY KEY, ADD PRIMARY KEY (farm_id, `key`)')

      // Create farm_id indexes
      for (const idx of FARM_ID_INDEXES) {
        await knex.raw(idx)
      }
    } finally {
      await knex.raw('SET FOREIGN_KEY_CHECKS=1')
    }
  }
}

// ── DOWN ───────────────────────────────────────────────────────────────────

exports.down = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  // Safety check: refuse if multiple farms exist
  const farmCount = await knex('farms').count('* as c').first()
  if (Number(farmCount.c) > 1) {
    throw new Error('Cannot rollback: multiple farms exist. Data would be lost.')
  }

  if (isSQLite) {
    await knex.raw('PRAGMA foreign_keys = OFF')

    await knex.raw('BEGIN')
    try {
      // Dedup guard for lookup tables (belt-and-suspenders)
      await knex('breed_types').whereNot('farm_id', DEFAULT_FARM_ID).del()
      await knex('issue_type_definitions').whereNot('farm_id', DEFAULT_FARM_ID).del()

      // Reverse recreation order (config first, then root, then leaves)
      const reverseOrder = [...RECREATION_ORDER].reverse()
      for (const tableName of reverseOrder) {
        await recreateTable(knex, tableName, ROLLBACK_SCHEMAS[tableName])
      }

      await knex.raw('COMMIT')
      await knex.raw('PRAGMA foreign_keys = ON')
    } catch (err) {
      await knex.raw('ROLLBACK')
      await knex.raw('PRAGMA foreign_keys = ON')
      throw err
    }
  } else {
    // MySQL branch
    // Restore original unique constraints
    await knex.raw('ALTER TABLE users DROP INDEX farm_id, ADD UNIQUE INDEX users_username_unique (username)')
    await knex.raw('ALTER TABLE cows DROP INDEX farm_id, ADD UNIQUE INDEX cows_tag_number_unique (tag_number)')
    await knex.raw('ALTER TABLE breed_types DROP INDEX farm_id, ADD UNIQUE INDEX breed_types_code_unique (code)')
    await knex.raw('ALTER TABLE issue_type_definitions DROP INDEX farm_id, ADD UNIQUE INDEX issue_type_definitions_code_unique (code)')
    await knex.raw('ALTER TABLE milk_records DROP INDEX farm_id, ADD UNIQUE INDEX milk_records_cow_id_session_recording_date_unique (cow_id, session, recording_date)')

    // Restore original PKs for config tables
    await knex.raw('ALTER TABLE feature_flags DROP PRIMARY KEY, ADD PRIMARY KEY (`key`)')
    await knex.raw('ALTER TABLE app_settings DROP PRIMARY KEY, ADD PRIMARY KEY (`key`)')

    // Revert role ENUM
    await knex.raw(`ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'worker') NOT NULL DEFAULT 'worker'`)

    // Drop token_version
    await knex.raw('ALTER TABLE users DROP COLUMN token_version')

    // Drop farm_id from all tables
    for (const tableName of RECREATION_ORDER) {
      await knex.raw(`ALTER TABLE \`${tableName}\` DROP COLUMN farm_id`)
    }

    // Drop farm_id indexes (already dropped with column)
  }

  // Drop farms table
  await knex.schema.dropTableIfExists('farms')
}
