<template>
  <div class="page">
    <AppHeader :title="t('milkHistory.title')" show-back back-to="/milk" />

    <div class="page-content">
      <!-- Date range -->
      <div data-tour="history-filters" class="date-range-row">
        <div class="date-field">
          <label class="filter-label">{{ t('milkHistory.dateFrom') }}</label>
          <input v-model="dateFrom" type="date" class="form-input" @change="resetAndFetch" />
        </div>
        <span class="filter-sep">&ndash;</span>
        <div class="date-field">
          <label class="filter-label">{{ t('milkHistory.dateTo') }}</label>
          <input v-model="dateTo" type="date" class="form-input" @change="resetAndFetch" />
        </div>
      </div>

      <!-- Search -->
      <div data-tour="history-search" class="search-bar">
        <SearchInput
          v-model="searchQuery"
          :placeholder="t('milkHistory.searchPlaceholder')"
          @update:model-value="resetAndFetch"
        />
      </div>

      <!-- Advanced filters toggle -->
      <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        {{ t('milkHistory.advancedFilters') }}
        <span v-if="advancedFilterCount > 0" class="filter-badge">{{ advancedFilterCount }}</span>
        <span class="toggle-arrow" :class="{ open: showAdvanced }">&#9662;</span>
      </button>

      <div v-if="showAdvanced" class="advanced-filters">
        <!-- Session filter -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('milkHistory.filterSession') }}</span>
          <div class="filter-chips filter-chips-wrap">
            <button
              class="chip"
              :class="{ active: sessionFilter === '' }"
              :aria-pressed="sessionFilter === ''"
              @click="setSessionFilter('')"
            >
              {{ t('milkHistory.filterAllSessions') }}
            </button>
            <button
              v-for="s in sessions"
              :key="s"
              class="chip"
              :class="{ active: sessionFilter === s }"
              :aria-pressed="sessionFilter === s"
              @click="setSessionFilter(s)"
            >
              {{ t(`milkHistory.${s}`) }}
            </button>
          </div>
        </div>

        <div class="filter-divider" />

        <!-- Cow filter -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('milkHistory.filterCow') }}</span>
          <CowSearchDropdown
            v-model="cowFilter"
            :placeholder="t('milkHistory.searchPlaceholder')"
            sex-filter="female"
          />
        </div>

        <div class="filter-divider" />

        <!-- Discarded only -->
        <div class="filter-group">
          <div class="filter-chips filter-chips-wrap">
            <button
              class="chip chip-accent"
              :class="{ active: discardedOnly }"
              :aria-pressed="discardedOnly"
              @click="toggleDiscarded"
            >
              {{ t('milkHistory.filterDiscarded') }}
            </button>
          </div>
        </div>

        <div class="filter-divider" />

        <!-- Recorded by -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('milkHistory.filterRecordedBy') }}</span>
          <select v-model="recorderFilter" class="form-select filter-select" @change="resetAndFetch">
            <option value="">{{ t('milkHistory.filterAllRecorders') }}</option>
            <option v-for="rec in recorders" :key="rec.id" :value="rec.id">{{ rec.full_name }}</option>
          </select>
        </div>
      </div>

      <!-- Summary bar -->
      <div v-if="!loading && total > 0" class="summary-bar">
        {{ t('milkHistory.summaryCount', { count: records.length }) }} &bull;
        {{ t('milkHistory.summaryLitres', { litres: pageLitres }) }}
      </div>

      <!-- Loading -->
      <div v-if="loading" class="empty-state">
        <span class="spinner" />
        <p>{{ t('common.loading') }}</p>
      </div>

      <!-- Empty -->
      <div v-else-if="records.length === 0" class="empty-state">
        <p>{{ t('milkHistory.noRecords') }}</p>
      </div>

      <!-- Record list -->
      <div v-else data-tour="history-records" class="record-list">
        <MilkRecordCard
          v-for="rec in records"
          :key="rec.id"
          :record="rec"
        />
      </div>

      <!-- Pagination -->
      <div data-tour="history-pagination">
        <PaginationBar
          :total="total"
          :page="page"
          :limit="limit"
          @update:page="onPageChange"
          @update:limit="onLimitChange"
        />
      </div>
    </div>

    <TourButton @start-tour="startTour" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../components/organisms/AppHeader.vue'
import MilkRecordCard from '../components/molecules/MilkRecordCard.vue'
import SearchInput from '../components/atoms/SearchInput.vue'
import PaginationBar from '../components/atoms/PaginationBar.vue'
import CowSearchDropdown from '../components/molecules/CowSearchDropdown.vue'
import TourButton from '../components/atoms/TourButton.vue'
import api from '../services/api'
import db from '../db/indexedDB'
import { extractApiError, resolveError } from '../utils/apiError'
import { useToast } from '../composables/useToast'
import { useTour } from '../composables/useTour.js'

const { t } = useI18n()
const toast = useToast()

const sessions = ['morning', 'afternoon', 'evening']

// Default: 3 months ago (1st of that month) → today
function defaultFrom() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

const dateFrom = ref(defaultFrom())
const dateTo = ref(today())
const searchQuery = ref('')
const sessionFilter = ref('')
const cowFilter = ref(null)
const discardedOnly = ref(false)
const recorderFilter = ref('')
const showAdvanced = ref(false)

const records = ref([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const loading = ref(false)
const recorders = ref([])

const pageLitres = computed(() => {
  const sum = records.value.reduce((acc, r) => acc + Number(r.litres), 0)
  return Math.round(sum * 100) / 100
})

const advancedFilterCount = computed(() => {
  let n = 0
  if (sessionFilter.value) n++
  if (cowFilter.value) n++
  if (discardedOnly.value) n++
  if (recorderFilter.value) n++
  return n
})

async function fetchRecorders() {
  try {
    const { data } = await api.get('/milk-records/recorders')
    recorders.value = data
  } catch {
    // silently fail — dropdown just stays empty
  }
}

async function fetchRecords() {
  loading.value = true
  try {
    const params = {
      page: page.value,
      limit: limit.value,
      from: dateFrom.value,
      to: dateTo.value,
      sort: 'recording_date',
      order: 'desc',
    }
    if (searchQuery.value) params.search = searchQuery.value
    if (sessionFilter.value) params.session = sessionFilter.value
    if (cowFilter.value) params.cow_id = cowFilter.value
    if (discardedOnly.value) params.discarded = true
    if (recorderFilter.value) params.recorded_by = recorderFilter.value

    const { data } = await api.get('/milk-records', { params })
    let serverRecords = data.data
    const serverTotal = data.total

    // Merge unsynced local records on first page only
    if (page.value === 1) {
      const unsyncedLocal = await getUnsyncedLocal()
      if (unsyncedLocal.length > 0) {
        const serverIds = new Set(serverRecords.map((r) => r.id))
        const missing = unsyncedLocal.filter((r) => !serverIds.has(r.id))
        if (missing.length > 0) {
          serverRecords = [...missing, ...serverRecords]
          serverRecords.sort((a, b) => (b.recording_date || '').localeCompare(a.recording_date || ''))
        }
        records.value = serverRecords
        total.value = serverTotal + missing.length
      } else {
        records.value = serverRecords
        total.value = serverTotal
      }
    } else {
      records.value = serverRecords
      total.value = serverTotal
    }
  } catch (err) {
    // Offline fallback: query IndexedDB only
    try {
      records.value = await getLocalRecords()
      total.value = records.value.length
    } catch {
      toast.show(resolveError(extractApiError(err), t), 'error')
    }
  } finally {
    loading.value = false
  }
}

/** Get unsynced records from IndexedDB matching current filters */
async function getUnsyncedLocal() {
  try {
    let local = await db.milkRecords.toArray()
    local = local.filter((r) => {
      const d = (r.recording_date || '').slice(0, 10)
      return d >= dateFrom.value && d <= dateTo.value && !r.synced_at
    })
    if (sessionFilter.value) local = local.filter((r) => r.session === sessionFilter.value)
    if (cowFilter.value) local = local.filter((r) => r.cow_id === cowFilter.value)
    if (discardedOnly.value) local = local.filter((r) => r.milk_discarded)
    if (recorderFilter.value) local = local.filter((r) => r.recorded_by === recorderFilter.value)
    return local
  } catch {
    return []
  }
}

/** Get all local records matching current filters (full offline fallback) */
async function getLocalRecords() {
  let local = await db.milkRecords.toArray()
  local = local.filter((r) => {
    const d = (r.recording_date || '').slice(0, 10)
    return d >= dateFrom.value && d <= dateTo.value
  })
  if (sessionFilter.value) local = local.filter((r) => r.session === sessionFilter.value)
  if (cowFilter.value) local = local.filter((r) => r.cow_id === cowFilter.value)
  if (discardedOnly.value) local = local.filter((r) => r.milk_discarded)
  if (recorderFilter.value) local = local.filter((r) => r.recorded_by === recorderFilter.value)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    local = local.filter((r) =>
      (r.tag_number || '').toLowerCase().includes(q) ||
      (r.cow_name || '').toLowerCase().includes(q) ||
      (r.recorded_by_name || '').toLowerCase().includes(q),
    )
  }
  local.sort((a, b) => (b.recording_date || '').localeCompare(a.recording_date || ''))
  return local
}

function resetAndFetch() {
  page.value = 1
  fetchRecords()
}

function setSessionFilter(value) {
  sessionFilter.value = value
  resetAndFetch()
}

function toggleDiscarded() {
  discardedOnly.value = !discardedOnly.value
  resetAndFetch()
}

function onPageChange(p) {
  page.value = p
  fetchRecords()
}

function onLimitChange(l) {
  limit.value = l
  resetAndFetch()
}

// Re-fetch when cow filter changes (emitted from CowSearchDropdown)
watch(cowFilter, resetAndFetch)

onMounted(() => {
  fetchRecords()
  fetchRecorders()
})

const { startTour } = useTour('milk-history', () => [
  {
    element: '[data-tour="history-filters"]',
    popover: {
      title: t('tour.milkHistory.filters.title'),
      description: t('tour.milkHistory.filters.desc'),
    }
  },
  {
    element: '[data-tour="history-search"]',
    popover: {
      title: t('tour.milkHistory.search.title'),
      description: t('tour.milkHistory.search.desc'),
    }
  },
  {
    element: '[data-tour="history-records"]',
    popover: {
      title: t('tour.milkHistory.records.title'),
      description: t('tour.milkHistory.records.desc'),
    }
  },
  {
    element: '[data-tour="history-pagination"]',
    popover: {
      title: t('tour.milkHistory.pagination.title'),
      description: t('tour.milkHistory.pagination.desc'),
    }
  },
])
</script>

<style scoped>
.page-content {
  padding-top: calc(var(--header-height) + 0.5rem);
  padding-bottom: calc(var(--nav-height) + 2rem);
}

.date-range-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}

.date-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.date-field .form-input {
  font-size: 0.8125rem;
  padding: 8px 10px;
}

.filter-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.filter-sep {
  color: var(--text-secondary);
  font-size: 0.8rem;
  flex-shrink: 0;
  padding-bottom: 10px;
}

.search-bar {
  margin-bottom: 12px;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0 12px;
}

.toggle-arrow {
  font-size: 0.7rem;
  transition: transform 0.2s;
}

.toggle-arrow.open {
  transform: rotate(180deg);
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: #fff;
  border-radius: 100px;
  font-size: 0.625rem;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
}

.advanced-filters {
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 12px;
}

.filter-group:last-child {
  padding-bottom: 4px;
}

.filter-group-title {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-secondary);
  opacity: 0.55;
}

.filter-divider {
  height: 1px;
  background: var(--border);
  margin: 0 0 12px;
}

.filter-select {
  max-width: 220px;
  font-size: 0.8125rem;
}

.chip-accent.active {
  background: var(--warning);
  border-color: var(--warning);
  color: #fff;
}

.summary-bar {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
}
</style>
