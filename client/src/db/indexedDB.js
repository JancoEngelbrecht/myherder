import Dexie from 'dexie'

const db = new Dexie('myherder_db')

db.version(1).stores({
  cows: 'id, tag_number, name, status, sex, updated_at',
  auth: 'key',
})

db.version(2).stores({
  cows: 'id, tag_number, name, status, sex, updated_at',
  auth: 'key',
  medications: 'id, name, is_active, updated_at',
  treatments: 'id, cow_id, medication_id, treatment_date, withdrawal_end_milk, updated_at',
})

db.version(3).stores({
  cows: 'id, tag_number, name, status, sex, updated_at',
  auth: 'key',
  medications: 'id, name, is_active, updated_at',
  treatments: 'id, cow_id, medication_id, treatment_date, withdrawal_end_milk, updated_at',
  healthIssues: 'id, cow_id, issue_type, status, observed_at, updated_at',
})

db.version(4).stores({
  cows: 'id, tag_number, name, status, sex, updated_at',
  auth: 'key',
  medications: 'id, name, is_active, updated_at',
  treatments: 'id, cow_id, medication_id, treatment_date, withdrawal_end_milk, updated_at',
  healthIssues: 'id, cow_id, issue_type, status, observed_at, updated_at',
  milkRecords: 'id, cow_id, session, recording_date, updated_at',
})

db.version(5).stores({
  cows: 'id, tag_number, name, status, sex, updated_at',
  auth: 'key',
  medications: 'id, name, is_active, updated_at',
  treatments: 'id, cow_id, medication_id, treatment_date, withdrawal_end_milk, updated_at',
  healthIssues: 'id, cow_id, issue_type, status, observed_at, updated_at',
  milkRecords: 'id, cow_id, session, recording_date, updated_at',
  breedingEvents: 'id, cow_id, event_type, event_date, expected_calving, expected_next_heat, updated_at',
})

db.version(6).stores({
  cows: 'id, tag_number, name, status, sex, updated_at',
  auth: 'key',
  medications: 'id, name, is_active, updated_at',
  treatments: 'id, cow_id, medication_id, treatment_date, withdrawal_end_milk, updated_at',
  healthIssues: 'id, cow_id, issue_type, status, observed_at, updated_at',
  milkRecords: 'id, cow_id, session, recording_date, updated_at',
  breedingEvents: 'id, cow_id, event_type, event_date, expected_calving, expected_next_heat, updated_at',
  breedTypes: 'id, code, name, is_active, sort_order',
})

export default db
