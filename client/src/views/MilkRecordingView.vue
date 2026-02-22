<template>
  <div class="page">
    <AppHeader :title="t('milkRecording.title')" />

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
      <div class="session-tabs">
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

      <!-- Time picker — only shown for past dates -->
      <div v-if="!isToday" class="time-row">
        <label class="control-label">{{ t('milkRecording.sessionTime') }}</label>
        <input
          v-model="selectedTime"
          type="time"
          class="form-input time-input"
        />
        <span class="time-hint">{{ t('milkRecording.sessionTimeHint') }}</span>
      </div>

      <!-- Search -->
      <SearchInput
        v-model="searchQuery"
        :placeholder="t('milkRecording.search')"
      />
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
    <div v-else class="cow-list">
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

    <!-- Summary footer — counts only active (milkable) cows -->
    <div v-if="!milkStore.loading && activeCows.length > 0" class="summary-footer">
      {{ t('milkRecording.summary', {
        recorded: summaryRecorded,
        total: activeCows.length,
        litres: summaryLitres,
        discarded: summaryDiscarded,
      }) }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../components/organisms/AppHeader.vue'
import MilkEntryCard from '../components/molecules/MilkEntryCard.vue'
import SearchInput from '../components/atoms/SearchInput.vue'
import { useCowsStore } from '../stores/cows'
import { useTreatmentsStore } from '../stores/treatments'
import { useMilkRecordsStore } from '../stores/milkRecords'

const { t } = useI18n()

const cowsStore = useCowsStore()
const treatmentsStore = useTreatmentsStore()
const milkStore = useMilkRecordsStore()

const sessions = [
  { value: 'morning' },
  { value: 'afternoon' },
  { value: 'evening' },
]

const sessionDefaultTimes = { morning: '06:00', afternoon: '12:00', evening: '18:00' }

const today = new Date().toISOString().slice(0, 10)
const selectedDate = ref(today)
const selectedSession = ref('morning')
const selectedTime = ref(sessionDefaultTimes.morning)
const searchQuery = ref('')

const isToday = computed(() => selectedDate.value === today)

// ── Qualifying cows (female only, active/dry, sorted active first) ────────────

const activeCows = computed(() =>
  cowsStore.cows.filter((c) => c.sex !== 'male' && c.status === 'active'),
)

const qualifyingCows = computed(() => {
  const active = cowsStore.cows.filter((c) => c.sex !== 'male' && c.status === 'active')
  const dry = cowsStore.cows.filter((c) => c.sex !== 'male' && c.status === 'dry')
  return [...active, ...dry]
})

const filteredCows = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return qualifyingCows.value
  return qualifyingCows.value.filter(
    (c) =>
      c.tag_number.toLowerCase().includes(q) ||
      (c.name && c.name.toLowerCase().includes(q)),
  )
})

// ── Withdrawal helpers ────────────────────────────────────────────────────────

function isOnWithdrawal(cowId) {
  return treatmentsStore.withdrawalCows.some((w) => w.cow_id === cowId)
}

function withdrawalEndDate(cowId) {
  const w = treatmentsStore.withdrawalCows.find((w) => w.cow_id === cowId)
  return w ? w.withdrawal_end_milk : null
}

// ── Summary — based on active (milkable) cows only, within current filter ─────

const summaryActiveCows = computed(() =>
  filteredCows.value.filter((c) => c.status === 'active'),
)

const summaryRecorded = computed(() =>
  summaryActiveCows.value.filter((c) => {
    const r = milkStore.getRecord(c.id)
    return r !== null
  }).length,
)

const summaryLitres = computed(() => {
  const total = summaryActiveCows.value.reduce((sum, c) => {
    const r = milkStore.getRecord(c.id)
    return sum + (r ? Number(r.litres) : 0)
  }, 0)
  return Math.round(total * 100) / 100
})

const summaryDiscarded = computed(() =>
  summaryActiveCows.value.filter((c) => {
    const r = milkStore.getRecord(c.id)
    return r && r.milk_discarded
  }).length,
)

// ── Actions ───────────────────────────────────────────────────────────────────

function handleUpdate(cowId, litres) {
  const onWithdrawal = isOnWithdrawal(cowId)
  const endDate = withdrawalEndDate(cowId)
  const discardReason = onWithdrawal && endDate
    ? `Medication withdrawal until ${new Date(endDate).toLocaleDateString()}`
    : null
  const sessionTime = isToday.value ? null : selectedTime.value

  milkStore.autoSave(cowId, litres, selectedSession.value, selectedDate.value, onWithdrawal, discardReason, sessionTime)
}

function setSession(session) {
  selectedSession.value = session
  if (!isToday.value) {
    selectedTime.value = sessionDefaultTimes[session]
  }
  // watcher handles loadRecords
}

function onDateChange() {
  if (!isToday.value) {
    selectedTime.value = sessionDefaultTimes[selectedSession.value]
  }
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
  if (cowsStore.cows.length === 0) await cowsStore.fetchAll()
  await loadRecords()
})

watch([selectedDate, selectedSession], loadRecords)
</script>

<style scoped>
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
