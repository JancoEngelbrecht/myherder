<template>
  <div class="page">
    <AppHeader :title="t('milkRecording.title')" show-back back-to="/" />

    <div class="controls">
      <!-- Date picker -->
      <div class="date-row">
        <label class="control-label">{{ t('milkRecording.date') }}</label>
        <input
          v-model="selectedDate"
          type="date"
          class="form-input date-input"
          :max="today"
          @change="onDateChange"
        />
      </div>

      <!-- Session tabs -->
      <div data-tour="milk-session" class="session-tabs">
        <button
          v-for="s in sessions"
          :key="s.value"
          class="session-tab"
          :class="{ active: selectedSession === s.value }"
          @click="setSession(s.value)"
        >
          {{ t(`milkRecording.${s.value}`) }}
        </button>
      </div>

      <!-- Time picker — always shown -->
      <div class="time-row">
        <label class="control-label">{{ t('milkRecording.sessionTime') }}</label>
        <input v-model="selectedTime" type="time" class="form-input time-input" />
        <span class="time-hint">{{ t('milkRecording.sessionTimeHint') }}</span>
      </div>

      <!-- Search -->
      <div data-tour="milk-search">
        <SearchInput v-model="searchQuery" :placeholder="t('milkRecording.search')" />
      </div>
    </div>

    <!-- View history link -->
    <div data-tour="milk-history" class="history-link-row">
      <router-link to="/milk/history" class="history-link">
        {{ t('milkRecording.viewHistory') }} →
      </router-link>
    </div>

    <!-- Error banner -->
    <div v-if="milkStore.error && !milkStore.loading" class="fetch-error-banner">
      {{ resolveError(milkStore.error, t) }}
    </div>

    <!-- Loading -->
    <div v-if="milkStore.loading" class="empty-state">
      <span class="spinner" />
      <p>{{ t('common.loading') }}</p>
    </div>

    <!-- No cows -->
    <div v-else-if="filteredCows.length === 0" class="empty-state">
      <p>{{ t('milkRecording.noActiveCows') }}</p>
    </div>

    <!-- Cow list -->
    <div v-else data-tour="milk-entries" class="cow-list">
      <MilkEntryCard
        v-for="cow in filteredCows"
        :key="cow.id"
        :cow="cow"
        :record="milkStore.getRecord(cow.id)"
        :sync-status="milkStore.getStatus(cow.id)"
        :on-withdrawal="isOnWithdrawal(cow.id)"
        :withdrawal-until="withdrawalEndDate(cow.id)"
        @update="(litres) => handleUpdate(cow.id, litres)"
      />
    </div>

    <!-- Summary footer -->
    <div v-if="!milkStore.loading && qualifyingCows.length > 0" class="summary-footer">
      {{
        t('milkRecording.summary', {
          recorded: summary.recorded,
          total: qualifyingCows.length,
          litres: summary.litres,
          discarded: summary.discarded,
        })
      }}
    </div>

    <TourButton @start-tour="startTour" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../components/organisms/AppHeader.vue'
import MilkEntryCard from '../components/molecules/MilkEntryCard.vue'
import SearchInput from '../components/atoms/SearchInput.vue'
import TourButton from '../components/atoms/TourButton.vue'
import { useAnimalsStore, computeLifePhase } from '../stores/animals'
import { useTreatmentsStore } from '../stores/treatments'
import { useMilkRecordsStore } from '../stores/milkRecords'
import { resolveError } from '../utils/apiError'
import { useTour } from '../composables/useTour.js'

const { t } = useI18n()

const animalsStore = useAnimalsStore()
const treatmentsStore = useTreatmentsStore()
const milkStore = useMilkRecordsStore()

const sessions = [{ value: 'morning' }, { value: 'afternoon' }, { value: 'evening' }]

const sessionDefaultTimes = { morning: '06:00', afternoon: '12:00', evening: '18:00' }

function roundToQuarter() {
  const now = new Date()
  const mins = Math.round(now.getMinutes() / 15) * 15
  let h = mins === 60 ? now.getHours() + 1 : now.getHours()
  let m = mins === 60 ? 0 : mins
  if (h >= 24) {
    h = 23
    m = 45
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const today = new Date().toISOString().slice(0, 10)
const selectedDate = ref(today)
const selectedSession = ref('morning')
const selectedTime = ref(roundToQuarter())
const searchQuery = ref('')

const isToday = computed(() => selectedDate.value === today)

// ── Qualifying cows (only active adult females — cow or ewe life phase) ──────

const MILKING_PHASES = new Set(['cow', 'ewe'])
const isMilkable = (c) => c.sex !== 'male' && MILKING_PHASES.has(computeLifePhase(c))

const qualifyingCows = computed(() =>
  animalsStore.animals.filter((c) => isMilkable(c) && c.status === 'active')
)

const filteredCows = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return qualifyingCows.value
  return qualifyingCows.value.filter(
    (c) => c.tag_number.toLowerCase().includes(q) || (c.name && c.name.toLowerCase().includes(q))
  )
})

// ── Withdrawal helpers ────────────────────────────────────────────────────────

// O(1) lookup: indexed by cow_id
const withdrawalMap = computed(() => {
  const map = {}
  for (const w of treatmentsStore.withdrawalCows) {
    map[w.cow_id] = w
  }
  return map
})

function isOnWithdrawal(cowId) {
  const entry = withdrawalMap.value[cowId]
  if (!entry?.withdrawal_end_milk) return false
  return new Date(entry.withdrawal_end_milk).getTime() > Date.now()
}

function withdrawalEndDate(cowId) {
  return withdrawalMap.value[cowId]?.withdrawal_end_milk ?? null
}

// ── Summary ─────────────────────────────────────────────────────────────────

const summary = computed(() => {
  let recorded = 0,
    litres = 0,
    discarded = 0
  for (const c of qualifyingCows.value) {
    const r = milkStore.getRecord(c.id)
    if (r) {
      recorded++
      litres += Number(r.litres) || 0
      if (r.milk_discarded) discarded++
    }
  }
  return { recorded, litres: Math.round(litres * 100) / 100, discarded }
})

// ── Actions ───────────────────────────────────────────────────────────────────

function handleUpdate(cowId, litres) {
  const onWithdrawal = isOnWithdrawal(cowId)
  const endDate = withdrawalEndDate(cowId)
  const discardReason =
    onWithdrawal && endDate
      ? t('milkRecording.withdrawalDiscard', { date: new Date(endDate).toLocaleDateString() })
      : null

  milkStore.autoSave(
    cowId,
    litres,
    selectedSession.value,
    selectedDate.value,
    onWithdrawal,
    discardReason,
    selectedTime.value
  )
}

function setSession(session) {
  selectedSession.value = session
  selectedTime.value = isToday.value ? roundToQuarter() : sessionDefaultTimes[session]
  // watcher handles loadRecords
}

function onDateChange() {
  selectedTime.value = isToday.value ? roundToQuarter() : sessionDefaultTimes[selectedSession.value]
  // watcher handles loadRecords
}

async function loadRecords() {
  // Refresh withdrawal status on every session/date change so stale data doesn't linger
  await Promise.all([
    milkStore.fetchSession(selectedDate.value, selectedSession.value),
    treatmentsStore.fetchWithdrawal(),
  ])
}

// ── Init ──────────────────────────────────────────────────────────────────────

onMounted(async () => {
  await animalsStore.fetchAll()
  await loadRecords()
})

watch([selectedDate, selectedSession], loadRecords)

const { startTour } = useTour('milk-recording', () => [
  {
    element: '[data-tour="milk-session"]',
    popover: {
      title: t('tour.milkRecording.session.title'),
      description: t('tour.milkRecording.session.desc'),
    },
  },
  {
    element: '[data-tour="milk-search"]',
    popover: {
      title: t('tour.milkRecording.search.title'),
      description: t('tour.milkRecording.search.desc'),
    },
  },
  {
    element: '[data-tour="milk-entries"]',
    popover: {
      title: t('tour.milkRecording.entryCard.title'),
      description: t('tour.milkRecording.entryCard.desc'),
    },
  },
  {
    element: '[data-tour="milk-history"]',
    popover: {
      title: t('tour.milkRecording.history.title'),
      description: t('tour.milkRecording.history.desc'),
    },
  },
])
</script>

<style scoped>
.fetch-error-banner {
  background: var(--danger-light);
  color: var(--danger);
  padding: 10px 14px;
  margin: 0 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 500;
  border: 1px solid rgba(220, 38, 38, 0.2);
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  padding-top: calc(var(--header-height) + 1rem);
}

.date-row,
.time-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.control-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

.date-input {
  flex: 1;
  max-width: 180px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.9rem;
}

.time-input {
  width: 120px;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.9rem;
}

.time-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  flex: 1;
}

.session-tabs {
  display: flex;
  gap: 0.5rem;
}

.session-tab {
  flex: 1;
  padding: 0.55rem 0;
  border: 2px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.session-tab.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.cow-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  padding-bottom: 5rem;
}

.history-link-row {
  padding: 0 1rem;
  text-align: right;
}

.history-link {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
}

.summary-footer {
  position: fixed;
  bottom: var(--nav-height);
  left: 0;
  right: 0;
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 0.6rem 1rem;
  font-size: 0.82rem;
  color: var(--text-secondary);
  text-align: center;
  font-family: var(--font-mono);
  z-index: 10;
}
</style>
