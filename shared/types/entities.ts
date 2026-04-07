/**
 * Entity interfaces — API response shapes as returned by the server.
 * These match what the frontend receives, which may differ from DB rows
 * (e.g. joined fields, camelCase/snake_case mix, computed fields).
 */

export interface Animal {
  id: string
  farm_id: string
  tag_number: string
  name: string | null
  dob: string | null
  breed: string | null
  breed_type_id: string | null
  breed_type_name: string | null
  breed_type_code: string | null
  sex: 'female' | 'male'
  status: 'active' | 'dry' | 'pregnant' | 'sick' | 'sold' | 'dead'
  sire_id: string | null
  sire_name: string | null
  dam_id: string | null
  dam_name: string | null
  is_external: boolean
  purpose: 'natural_service' | 'ai_semen_donor' | 'both' | null
  life_phase_override: string | null
  is_dry: boolean
  status_changed_at: string | null
  birth_event_id: string | null
  species_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Medication {
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
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Treatment {
  id: string
  farm_id: string
  animal_id: string
  medication_id: string
  administered_by: string
  dosage: string | null
  cost: number | null
  treatment_date: string
  withdrawal_end_milk: string | null
  withdrawal_end_meat: string | null
  is_vet_visit: boolean
  vet_name: string | null
  notes: string | null
  health_issue_id: string | null
  created_at: string
  updated_at: string
  synced_at: string | null
  // Joined fields
  medication_name?: string
  administered_by_name?: string
  tag_number?: string
  animal_name?: string
}

export interface HealthIssue {
  id: string
  farm_id: string
  animal_id: string
  reported_by: string
  severity: 'low' | 'medium' | 'high'
  affected_teats: string[] | null
  description: string | null
  observed_at: string
  status: 'open' | 'treating' | 'resolved'
  resolved_at: string | null
  issue_types: string[] // array of codes
  created_at: string
  updated_at: string
  synced_at: string | null
  // Joined fields
  tag_number?: string
  animal_name?: string
  reported_by_name?: string
}

export interface MilkRecord {
  id: string
  farm_id: string
  animal_id: string
  recorded_by: string
  session: 'morning' | 'afternoon' | 'evening'
  litres: number
  recording_date: string
  milk_discarded: boolean
  discard_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  synced_at: string | null
  // Joined fields
  tag_number?: string
  animal_name?: string
  recorded_by_name?: string
}

export interface BreedingEvent {
  id: string
  farm_id: string
  animal_id: string
  event_type: string
  event_date: string
  sire_id: string | null
  semen_id: string | null
  inseminator: string | null
  heat_signs: string[] | null
  preg_check_method: 'manual' | 'ultrasound' | 'blood_test' | null
  calving_details: Record<string, unknown> | null
  cost: number | null
  expected_next_heat: string | null
  expected_preg_check: string | null
  expected_calving: string | null
  expected_dry_off: string | null
  offspring_count: number
  notes: string | null
  recorded_by: string | null
  is_dismissed: boolean
  dismissed_by: string | null
  dismissed_at: string | null
  created_at: string
  updated_at: string
  synced_at: string | null
  // Joined fields
  tag_number?: string
  animal_name?: string
  recorded_by_name?: string
}

export interface BreedType {
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
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface IssueType {
  id: string
  farm_id: string
  code: string
  name: string
  emoji: string | null
  requires_teat_selection: boolean
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Species {
  id: string
  code: string
  name: string
  config: SpeciesConfig | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface SpeciesConfig {
  terminology: {
    singular: string
    plural: string
    maleSingular: string
    femaleSingular: string
    youngSingular: string
    youngPlural: string
    collectiveNoun: string
    birthEvent: string
    birthEventPast: string
    maleService: string
  }
  emoji: {
    female: string
    male: string
    young: string
  }
  life_phases: {
    female: Array<{ code: string; maxMonths?: number; minMonths?: number }>
    male: Array<{ code: string; maxMonths?: number; minMonths?: number }>
  }
  event_types: string[]
  typical_multiple_births: number
  max_offspring: number
}

export interface User {
  id: string
  farm_id: string
  username: string
  full_name: string
  role: 'admin' | 'worker' | 'super_admin'
  permissions: string[]
  language: string
  is_active: boolean
  token_version: number
  created_at: string
  updated_at: string
}

export interface Farm {
  id: string
  name: string
  code: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FarmGroup {
  id: string
  name: string
  created_at: string
  updated_at: string
  farms?: Farm[]
}

export interface Announcement {
  id: string
  type: 'info' | 'warning' | 'maintenance'
  title: string
  message: string | null
  is_active: boolean
  starts_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface AuditLogEntry {
  id: string
  farm_id: string | null
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  old_value: unknown | null
  new_value: unknown | null
  ip_address: string | null
  created_at: string
  // Joined
  username?: string
  full_name?: string
}

export interface AppSetting {
  key: string
  value: string | null
  updated_at: string
}
