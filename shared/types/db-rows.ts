/**
 * Database row types — snake_case matching migration column definitions exactly.
 * These represent raw rows as returned by Knex queries, before any API transformation.
 */

export interface UserRow {
  id: string
  farm_id: string
  username: string
  pin_hash: string | null
  password_hash: string | null
  full_name: string
  role: 'admin' | 'worker' | 'super_admin'
  permissions: string // JSON array string
  language: string
  is_active: boolean | number
  failed_attempts: number
  locked_until: string | null
  created_at: string | Date
  updated_at: string | Date
  deleted_at: string | Date | null
  token_version: number
  totp_secret: string | null
  totp_enabled: boolean | number
  totp_recovery_codes: string | null
}

export interface FarmRow {
  id: string
  name: string
  code: string
  is_active: boolean | number
  created_at: string | Date
  updated_at: string | Date
}

export interface AnimalRow {
  id: string
  farm_id: string
  tag_number: string
  name: string | null
  dob: string | null
  breed: string | null
  breed_type_id: string | null
  sex: 'female' | 'male'
  status: 'active' | 'dry' | 'pregnant' | 'sick' | 'sold' | 'dead'
  sire_id: string | null
  dam_id: string | null
  is_external: boolean | number
  purpose: 'natural_service' | 'ai_semen_donor' | 'both' | null
  life_phase_override: string | null
  is_dry: boolean | number
  status_changed_at: string | Date | null
  birth_event_id: string | null
  species_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string | Date
  updated_at: string | Date
  deleted_at: string | Date | null
}

export interface MedicationRow {
  id: string
  farm_id: string
  name: string
  active_ingredient: string | null
  withdrawal_milk_hours: number
  withdrawal_milk_days: number
  withdrawal_meat_hours: number
  withdrawal_meat_days: number
  default_dosage: string | null
  unit: string | null
  notes: string | null
  is_active: boolean | number
  created_at: string | Date
  updated_at: string | Date
}

export interface TreatmentRow {
  id: string
  farm_id: string
  animal_id: string
  medication_id: string
  administered_by: string
  dosage: string | null
  cost: number | null
  treatment_date: string | Date
  withdrawal_end_milk: string | Date | null
  withdrawal_end_meat: string | Date | null
  is_vet_visit: boolean | number
  vet_name: string | null
  notes: string | null
  health_issue_id: string | null
  created_at: string | Date
  updated_at: string | Date
  synced_at: string | Date | null
}

export interface HealthIssueRow {
  id: string
  farm_id: string
  animal_id: string
  reported_by: string
  severity: 'low' | 'medium' | 'high'
  affected_teats: string | null // JSON array string
  description: string | null
  observed_at: string | Date
  status: 'open' | 'treating' | 'resolved'
  resolved_at: string | Date | null
  issue_types: string | null // JSON array string of codes
  created_at: string | Date
  updated_at: string | Date
  synced_at: string | Date | null
}

export interface MilkRecordRow {
  id: string
  farm_id: string
  animal_id: string
  recorded_by: string
  session: 'morning' | 'afternoon' | 'evening'
  litres: number
  recording_date: string
  milk_discarded: boolean | number
  discard_reason: string | null
  notes: string | null
  created_at: string | Date
  updated_at: string | Date
  synced_at: string | Date | null
}

export interface BreedingEventRow {
  id: string
  farm_id: string
  animal_id: string
  event_type: string
  event_date: string | Date
  sire_id: string | null
  semen_id: string | null
  inseminator: string | null
  heat_signs: string | null // JSON string
  preg_check_method: 'manual' | 'ultrasound' | 'blood_test' | null
  calving_details: string | null // JSON string
  cost: number | null
  expected_next_heat: string | null
  expected_preg_check: string | null
  expected_calving: string | null
  expected_dry_off: string | null
  offspring_count: number
  notes: string | null
  recorded_by: string | null
  is_dismissed: boolean | number
  dismissed_by: string | null
  dismissed_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
  synced_at: string | Date | null
}

export interface BreedTypeRow {
  id: string
  farm_id: string
  code: string
  name: string
  heat_cycle_days: number
  gestation_days: number
  preg_check_days: number
  voluntary_waiting_days: number
  dry_off_days: number
  calf_max_months: number
  heifer_min_months: number
  young_bull_min_months: number
  species_id: string | null
  is_active: boolean | number
  sort_order: number
  created_at: string | Date
  updated_at: string | Date
}

export interface IssueTypeRow {
  id: string
  farm_id: string
  code: string
  name: string
  emoji: string | null
  requires_teat_selection: boolean | number
  is_active: boolean | number
  sort_order: number
  created_at: string | Date
  updated_at: string | Date
}

export interface SpeciesRow {
  id: string
  code: string
  name: string
  config: string | null // JSON string
  is_active: boolean | number
  sort_order: number
  created_at: string | Date
  updated_at: string | Date
}

export interface FarmSpeciesRow {
  farm_id: string
  species_id: string
}

export interface AuditLogRow {
  id: string
  farm_id: string | null
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_value: string | null // JSON string
  new_value: string | null // JSON string
  ip_address: string | null
  created_at: string | Date
}

export interface AppSettingRow {
  key: string
  value: string | null
  updated_at: string | Date
}

export interface FarmGroupRow {
  id: string
  name: string
  created_at: string | Date
  updated_at: string | Date
}

export interface FarmGroupMemberRow {
  id: string
  farm_group_id: string
  farm_id: string
  added_at: string | Date
}

export interface AnnouncementRow {
  id: string
  type: 'info' | 'warning' | 'maintenance'
  title: string
  message: string | null
  is_active: boolean | number
  starts_at: string | Date | null
  expires_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}

export interface SyncLogRow {
  id: string
  farm_id: string
  device_id: string
  entity_type: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  synced_at: string | Date
}
