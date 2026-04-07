/**
 * API request/response types — shapes used across HTTP boundaries.
 */

export interface PaginatedResponse<T> {
  data: T[]
  total: number
}

// ── Animal query params ─────────────────────────────────────────────────────

export interface AnimalQueryParams {
  search?: string
  status?: 'active' | 'dry' | 'pregnant' | 'sick' | 'sold' | 'dead'
  sex?: 'female' | 'male'
  breed_type_id?: string
  life_phase?: string
  species_id?: string
  birth_event_id?: string
  pregnant?: string
  dim_min?: number
  dim_max?: number
  calving_after?: string
  calving_before?: string
  yield_min?: number
  yield_max?: number
  page?: number
  limit?: number
  sort?: 'tag_number' | 'name' | 'dob' | 'status'
  order?: 'asc' | 'desc'
}

// ── Milk record query params ────────────────────────────────────────────────

export interface MilkRecordQueryParams {
  page?: number
  limit?: number
  date?: string
  from?: string
  to?: string
  session?: 'morning' | 'afternoon' | 'evening'
  animal_id?: string
  recorded_by?: string
  search?: string
  discarded?: boolean | string
  sort?: 'recording_date' | 'litres' | 'tag_number'
  order?: 'asc' | 'desc'
}

// ── Breeding event query params ─────────────────────────────────────────────

export interface BreedingEventQueryParams {
  page?: number
  limit?: number
  animal_id?: string
  event_type?: string
}

// ── Analytics responses ─────────────────────────────────────────────────────

export interface HerdSummaryResponse {
  total: number
  by_status: Array<{ status: string; count: number }>
  milking_count: number
  dry_count: number
  heifer_count: number
  males: number
  females: number
  replacement_rate: number
}

export interface DailyKpiResponse {
  litres_today: number
  litres_7day_avg: number
  cows_milked_today: number
  cows_expected: number
  active_health_issues: number
  breeding_actions_due: number
}

export interface MonthlyMilkTrend {
  month: string
  total_litres: number
  record_count: number
  avg_per_cow: number
}

export interface MilkTrendsResponse {
  months: MonthlyMilkTrend[]
}

export interface TopProducerEntry {
  id: string
  tag_number: string
  name: string | null
  total_litres: number
  days_recorded: number
  avg_daily_litres: number
}

export interface BreedingOverviewResponse {
  pregnant_count: number
  not_pregnant_count: number
  repro_status: {
    pregnant: number
    not_pregnant: number
    bred_awaiting_check: number
    dry: number
    heifer_not_bred: number
  }
  abortion_count: number
  pregnancy_rate: number
  calvings_by_month: Array<{ month: string; count: number }>
  avg_services_per_conception: number
}

// ── Sync types ──────────────────────────────────────────────────────────────

export type SyncAction = 'create' | 'update' | 'delete'

export interface SyncChange {
  entityType: string
  action: SyncAction
  id: string
  data?: Record<string, unknown>
  updatedAt: string
}

export interface SyncPushBody {
  deviceId: string
  changes: SyncChange[]
}

export interface SyncPushResult {
  id: string
  entityType: string
  status: 'ok' | 'conflict' | 'error'
  serverData?: Record<string, unknown>
  error?: string
}

export interface SyncPushResponse {
  results: SyncPushResult[]
}

export interface SyncPullResponse {
  cows?: unknown[]
  medications?: unknown[]
  treatments?: unknown[]
  healthIssues?: unknown[]
  milkRecords?: unknown[]
  breedingEvents?: unknown[]
  breedTypes?: unknown[]
  issueTypes?: unknown[]
  deleted?: Array<{ entity_type: string; entity_id: string; deleted_at: string }>
  syncedAt: string
}

// ── Auth responses ──────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string
  user: {
    id: string
    farm_id: string | null
    username: string
    full_name: string
    role: string
    permissions: string[]
    language: string
    token_version: number
    species_code?: string
  }
}

export interface LoginRequires2faResponse {
  requires_2fa: boolean
  temp_token: string
}

export interface LoginRequiresSetupResponse {
  requires_totp_setup: boolean
  temp_token: string
}

// ── Feature flags ───────────────────────────────────────────────────────────

export interface FeatureFlags {
  breeding: boolean
  milkRecording: boolean
  healthIssues: boolean
  treatments: boolean
  analytics: boolean
}

// ── Audit log ───────────────────────────────────────────────────────────────

export interface AuditLogQueryParams {
  page?: number
  limit?: number
  entity_type?: string
  entity_id?: string
  user_id?: string
  action?: string
  from?: string
  to?: string
}
