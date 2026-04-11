<template>
  <div class="page withdrawal-page" :class="{ 'meat-theme': activeTab === 'meat' }">
    <AppHeader :title="$t('withdrawal.title')" show-back back-to="/" />

    <div class="page-content">
      <div v-if="loading" class="spinner-wrap"><div class="spinner" /></div>

      <!-- Global all-clear -->
      <div
        v-else-if="(!isDairy || milkCows.length === 0) && meatCows.length === 0"
        class="empty-state clear-state"
      >
        <div class="clear-icon"><AppIcon name="check-circle" :size="64" /></div>
        <h2>{{ $t('withdrawal.allClear') }}</h2>
        <p>{{ $t('withdrawal.allClearSub') }}</p>
      </div>

      <template v-else>
        <!-- ── Tab bar ── -->
        <div class="filter-chips">
          <button
            v-if="isDairy"
            class="chip"
            :class="{ active: activeTab === 'milk' }"
            @click="activeTab = 'milk'"
          >
            <AppIcon name="droplets" :size="14" />
            {{ $t('withdrawal.milkSection') }}
            <span v-if="milkCows.length > 0" class="chip-count">{{ milkCows.length }}</span>
          </button>
          <button
            class="chip"
            :class="{ active: activeTab === 'meat' }"
            @click="activeTab = 'meat'"
          >
            <AppIcon name="utensils" :size="14" />
            {{ $t('withdrawal.meatSection') }}
            <span v-if="meatCows.length > 0" class="chip-count">{{ meatCows.length }}</span>
          </button>
        </div>

        <!-- ── Milk Tab (dairy species only) ── -->
        <div v-if="isDairy && activeTab === 'milk'">
          <div v-if="milkCows.length > 0" class="alert-banner milk-banner">
            <span class="alert-icon"><AppIcon name="ban" :size="22" /></span>
            <span>{{ $t('withdrawal.milkBanner', { count: milkCows.length }) }}</span>
          </div>

          <div v-if="milkCows.length === 0" class="section-clear">
            <span class="section-clear-icon"><AppIcon name="check-circle" :size="20" /></span>
            <span>{{ $t('withdrawal.milkAllClear') }}</span>
          </div>

          <div v-else class="cow-list">
            <div v-for="item in paginatedMilkCows" :key="item.cow_id" class="withdrawal-card">
              <div class="card-top">
                <div class="cow-id">
                  <span class="tag-number mono">{{ item.tag_number }}</span>
                  <span v-if="item.cow_name" class="cow-name">{{ item.cow_name }}</span>
                </div>
                <RouterLink :to="`/animals/${item.cow_id}`" class="view-link">
                  {{ $t('common.view') }} <AppIcon name="arrow-right" :size="13" />
                </RouterLink>
              </div>

              <div class="med-info">
                <span class="med-name">{{ item.medication_name }}</span>
              </div>

              <div class="withdrawal-row">
                <span class="wd-label wd-label-icon"
                  ><AppIcon name="droplets" :size="14" /> {{ $t('withdrawal.milkClear') }}</span
                >
                <div class="wd-right">
                  <span class="wd-date mono">{{ formatDateTime(item.withdrawal_end_milk) }}</span>
                  <span
                    class="countdown-badge"
                    :class="withdrawalInfo(item.withdrawal_end_milk).urgency"
                  >
                    {{ withdrawalInfo(item.withdrawal_end_milk).label }}
                  </span>
                </div>
              </div>

              <div class="treatment-date">
                {{ $t('withdrawal.treated') }}: {{ formatDateTime(item.treatment_date) }}
              </div>
            </div>

            <PaginationBar
              v-if="milkCows.length > milkLimit"
              :total="milkCows.length"
              :page="milkPage"
              :limit="milkLimit"
              :page-size-options="[10, 20, 50]"
              @update:page="milkPage = $event"
              @update:limit="
                (v) => {
                  milkLimit = v
                  milkPage = 1
                }
              "
            />
          </div>
        </div>

        <!-- ── Meat Tab ── -->
        <div v-if="activeTab === 'meat'">
          <div v-if="meatCows.length > 0" class="alert-banner meat-banner">
            <span class="alert-icon"><AppIcon name="ban" :size="22" /></span>
            <span>{{ $t('withdrawal.meatBanner', { count: meatCows.length }) }}</span>
          </div>

          <div v-if="meatCows.length === 0" class="section-clear">
            <span class="section-clear-icon"><AppIcon name="check-circle" :size="20" /></span>
            <span>{{ $t('withdrawal.meatAllClear') }}</span>
          </div>

          <div v-else class="cow-list">
            <div
              v-for="item in paginatedMeatCows"
              :key="item.cow_id"
              class="withdrawal-card meat-card"
            >
              <div class="card-top">
                <div class="cow-id">
                  <span class="tag-number mono">{{ item.tag_number }}</span>
                  <span v-if="item.cow_name" class="cow-name">{{ item.cow_name }}</span>
                </div>
                <RouterLink :to="`/animals/${item.cow_id}`" class="view-link">
                  {{ $t('common.view') }} <AppIcon name="arrow-right" :size="13" />
                </RouterLink>
              </div>

              <div class="med-info">
                <span class="med-name meat-med">{{ item.medication_name }}</span>
              </div>

              <div class="withdrawal-row">
                <span class="wd-label wd-label-icon"
                  ><AppIcon name="utensils" :size="14" /> {{ $t('withdrawal.meatClear') }}</span
                >
                <div class="wd-right">
                  <span class="wd-date mono">{{ formatDateTime(item.withdrawal_end_meat) }}</span>
                  <span
                    class="countdown-badge"
                    :class="withdrawalInfo(item.withdrawal_end_meat).urgency"
                  >
                    {{ withdrawalInfo(item.withdrawal_end_meat).label }}
                  </span>
                </div>
              </div>

              <div class="treatment-date">
                {{ $t('withdrawal.treated') }}: {{ formatDateTime(item.treatment_date) }}
              </div>
            </div>

            <PaginationBar
              v-if="meatCows.length > meatLimit"
              :total="meatCows.length"
              :page="meatPage"
              :limit="meatLimit"
              :page-size-options="[10, 20, 50]"
              @update:page="meatPage = $event"
              @update:limit="
                (v) => {
                  meatLimit = v
                  meatPage = 1
                }
              "
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useTreatmentsStore } from '../stores/treatments'
import { useSpeciesTerms } from '../composables/useSpeciesTerms'
import { formatDateTime } from '../utils/format'
import AppHeader from '../components/organisms/AppHeader.vue'
import PaginationBar from '../components/atoms/PaginationBar.vue'
import AppIcon from '../components/atoms/AppIcon.vue'

const store = useTreatmentsStore()
const { speciesCode } = useSpeciesTerms()
const loading = computed(() => store.loadingWithdrawal)
const withdrawalCows = computed(() => store.withdrawalCows)
const isDairy = computed(() => speciesCode.value === 'cattle')
const activeTab = ref('milk')

// Pagination state
const milkPage = ref(1)
const milkLimit = ref(10)
const meatPage = ref(1)
const meatLimit = ref(10)

// Reset pages when switching tabs
watch(activeTab, () => {
  milkPage.value = 1
  meatPage.value = 1
})

// Default to meat tab for non-dairy species (e.g. sheep)
watch(
  isDairy,
  (val) => {
    if (!val) activeTab.value = 'meat'
  },
  { immediate: true }
)

// Reactive timestamp — updates every 60s so expired withdrawals disappear automatically
const nowIso = ref(new Date().toISOString())
let timer
onMounted(() => {
  store.fetchWithdrawal()
  timer = setInterval(() => {
    nowIso.value = new Date().toISOString()
  }, 60_000)
})
onUnmounted(() => clearInterval(timer))

// Milk: only females currently being milked (exclude young/immature phases)
const NON_MILKING_PHASES = new Set(['heifer', 'calf', 'lamb'])
const milkCows = computed(() =>
  withdrawalCows.value.filter(
    (c) =>
      c.sex === 'female' &&
      !NON_MILKING_PHASES.has(c.life_phase) &&
      c.withdrawal_end_milk &&
      c.withdrawal_end_milk > nowIso.value
  )
)

// Meat: any animal with active meat withdrawal
const meatCows = computed(() =>
  withdrawalCows.value.filter((c) => c.withdrawal_end_meat && c.withdrawal_end_meat > nowIso.value)
)

// Paginated slices
const paginatedMilkCows = computed(() => {
  const start = (milkPage.value - 1) * milkLimit.value
  return milkCows.value.slice(start, start + milkLimit.value)
})
const paginatedMeatCows = computed(() => {
  const start = (meatPage.value - 1) * meatLimit.value
  return meatCows.value.slice(start, start + meatLimit.value)
})

function withdrawalInfo(endDate) {
  const diff = new Date(endDate) - Date.now()

  if (diff <= 0) return { label: '✓', urgency: 'urgency-done' }

  const hours = diff / 3_600_000
  const label =
    hours < 24
      ? `${Math.floor(hours)}h`
      : (() => {
          const d = Math.floor(hours / 24)
          const h = Math.floor(hours % 24)
          return h > 0 ? `${d}d ${h}h` : `${d}d`
        })()

  const urgency =
    hours <= 12
      ? 'urgency-critical'
      : hours <= 24
        ? 'urgency-high'
        : hours <= 72
          ? 'urgency-medium'
          : 'urgency-low'

  return { label, urgency }
}
</script>

<style scoped>
.withdrawal-page {
  background: #fff5f5;
  min-height: 100vh;
  transition: background 0.2s;
  overflow-x: hidden;
}

.withdrawal-page.meat-theme {
  background: #fdf5ee;
}

.cow-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  padding-bottom: 8px;
}

@media (min-width: 600px) {
  .cow-list {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  }
  .cow-list :deep(.pagination-bar) {
    grid-column: 1 / -1;
  }
}

.filter-chips {
  margin-bottom: 16px;
}

.alert-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  color: white;
  padding: 14px 18px;
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 14px;
  word-break: break-word;
}

.milk-banner {
  background: var(--danger);
}

.meat-banner {
  background: var(--withdrawal);
}

.alert-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.section-clear {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  background: var(--success-light, #e8f5e9);
  border-radius: var(--radius);
  color: var(--primary);
  font-weight: 500;
  font-size: 0.95rem;
}

.section-clear-icon {
  display: flex;
  align-items: center;
}

.spinner-wrap {
  display: flex;
  justify-content: center;
  padding: 60px;
}

.clear-state {
  text-align: center;
  padding: 60px 20px;
}

.clear-icon {
  display: flex;
  justify-content: center;
  color: var(--primary);
  margin-bottom: 16px;
}

.clear-state h2 {
  color: var(--primary);
  margin: 0 0 8px;
}

.clear-state p {
  color: var(--text-secondary);
}

.withdrawal-card {
  background: var(--surface);
  border: 2px solid var(--danger);
  border-radius: var(--radius);
  padding: 16px;
  box-shadow: 0 2px 12px rgba(220, 38, 38, 0.12);
  overflow: hidden;
}

.meat-card {
  border-color: var(--withdrawal);
  box-shadow: 0 2px 12px rgba(146, 64, 14, 0.12);
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.cow-id {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tag-number {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--danger);
}

.meat-card .tag-number {
  color: var(--withdrawal);
}

.cow-name {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.view-link {
  font-size: 0.85rem;
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.med-info {
  margin-bottom: 12px;
}

.med-name {
  font-size: 0.9rem;
  font-weight: 600;
  background: var(--danger-light);
  color: var(--danger);
  padding: 3px 10px;
  border-radius: var(--radius-full);
}

.meat-med {
  background: var(--withdrawal-bg);
  color: var(--withdrawal);
}

.withdrawal-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  flex-wrap: wrap;
  gap: 4px;
}

.wd-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.wd-label-icon {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.wd-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 1;
  min-width: 0;
}

.wd-date {
  font-size: 0.82rem;
  color: var(--text);
}

.countdown-badge {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  min-width: 50px;
  text-align: center;
}

.urgency-critical {
  background: var(--danger);
  color: white;
  animation: pulse-red 1s ease-in-out infinite;
}

.urgency-high {
  background: #ff5722;
  color: white;
}

.urgency-medium {
  background: var(--warning);
  color: white;
}

.urgency-low {
  background: var(--warning-light);
  color: var(--warning);
}

.urgency-done {
  background: var(--success-light);
  color: var(--primary);
}

.treatment-date {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 10px;
  border-top: 1px solid #f5e0e0;
  padding-top: 8px;
}

.refresh-row {
  position: fixed;
  bottom: calc(var(--nav-height) + var(--safe-bottom) + 16px);
  left: 50%;
  transform: translateX(-50%);
  width: auto;
}

.refresh-row .btn-secondary {
  width: auto;
  padding: 10px 24px;
}

@keyframes pulse-red {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}
</style>
