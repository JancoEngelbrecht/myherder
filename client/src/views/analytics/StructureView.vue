<template>
  <div class="page">
    <AppHeader :title="t('analytics.structure.title')" show-back back-to="/analytics" />

    <div class="page-content">
      <div v-if="offline" class="offline-banner">
        <AppIcon name="wifi-off" :size="18" />
        <span>{{ t('analytics.connectToView') }}</span>
      </div>

      <div v-if="!offline" class="filter-chips">
        <button
          v-for="opt in TIME_RANGE_OPTIONS"
          :key="opt.value"
          class="chip"
          :class="{ active: selectedRange === opt.value }"
          :aria-pressed="selectedRange === opt.value"
          @click="selectedRange = opt.value"
        >
          {{ t(opt.labelKey) }}
        </button>
      </div>

      <template v-if="!offline">
        <!-- Stat Chips -->
        <section class="analytics-card">
          <div v-if="summaryLoading || ageLoading || turnoverLoading" class="center-spinner">
            <div class="spinner" />
          </div>
          <div v-else class="stat-chips" @click="toggleChip">
            <div class="stat-chip">
              <span class="stat-value mono">{{ herdSummary.total }}</span>
              <span class="stat-label">{{ t('analytics.structure.totalHerd') }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono">{{ herdSummary.milking_count }}</span>
              <span class="stat-label">{{ t('analytics.structure.milkingCows', sp) }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono">{{ herdSummary.dry_count }}</span>
              <span class="stat-label">{{ t('analytics.structure.dryCows', sp) }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono">{{ herdSummary.heifer_count }}</span>
              <span class="stat-label">{{ t('analytics.structure.heifers') }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono" :class="replacementRateClass">
                {{
                  herdSummary.replacement_rate != null ? herdSummary.replacement_rate + '%' : '—'
                }}
              </span>
              <span class="stat-label">{{ t('analytics.structure.replacementRate') }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono">{{ avgAge != null ? avgAge : '—' }}</span>
              <span class="stat-label"
                >{{ t('analytics.structure.avgAge') }} ({{ t('analytics.structure.years') }})</span
              >
            </div>
            <div class="stat-chip">
              <span class="stat-value mono" :class="turnoverRateClass">
                {{ turnoverRate != null ? turnoverRate + '%' : '—' }}
              </span>
              <span class="stat-label">{{ t('analytics.structure.turnoverRate') }}</span>
            </div>
          </div>
        </section>

        <!-- Status Breakdown Doughnut -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.structure.statusBreakdown') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.structure.statusBreakdownDesc') }}</p>
          <div v-if="summaryLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="herdSummary.by_status.length > 0">
            <div class="chart-wrap doughnut-wrap">
              <Doughnut :data="statusChart" :options="doughnutOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Age Distribution (stacked bar) -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.structure.ageDistribution') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.structure.ageDistributionDesc') }}</p>
          <div v-if="ageLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="ageData && ageData.total > 0">
            <div class="chart-wrap">
              <Bar :data="ageChart" :options="stackedBarOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Breed Composition Doughnut -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.structure.breedComposition') }}</h2>
          <div v-if="breedLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="breedData && breedData.total > 0">
            <div class="chart-wrap doughnut-wrap">
              <Doughnut :data="breedChart" :options="doughnutOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Herd Turnover (grouped bar) -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.structure.herdTurnover') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.structure.herdTurnoverDesc') }}</p>
          <div v-if="turnoverLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="turnoverData && turnoverData.months.length > 0">
            <p class="chart-subtitle mono">
              {{ t('analytics.structure.totalAdditions') }}: {{ turnoverData.total_additions }} ·
              {{ t('analytics.structure.totalRemovals') }}: {{ turnoverData.total_removals }}
            </p>
            <div class="chart-wrap">
              <Bar :data="turnoverChart" :options="barChartOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Mortality & Cull Rate (stacked bar with benchmark annotation) -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.structure.mortalityRate') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.structure.mortalityRateDesc') }}</p>
          <div v-if="mortalityLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="mortalityData && mortalityData.months.length > 0">
            <p class="chart-subtitle mono">
              {{ t('analytics.structure.totalLost') }}: {{ mortalityData.total_lost }}
            </p>
            <div class="chart-wrap">
              <Bar :data="mortalityChart" :options="mortalityOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Herd Size Trend (area line) -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.structure.herdSizeTrend') }}</h2>
          <div v-if="trendLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="trendData && trendData.months.length > 0">
            <div class="chart-wrap">
              <Line :data="trendChart" :options="lineChartOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useSpeciesTerms } from '../../composables/useSpeciesTerms'
import { Line, Bar, Doughnut } from 'vue-chartjs'
import '../../utils/chartSetup.js'
import '../../assets/analytics.css'
import api from '../../services/api'
import AppHeader from '../../components/organisms/AppHeader.vue'
import AppIcon from '../../components/atoms/AppIcon.vue'
import {
  useAnalytics,
  chartColors,
  formatMonth,
  lineChartOptions,
  barChartOptions,
  useTimeRange,
  TIME_RANGE_OPTIONS,
} from '../../composables/useAnalytics'

const { offline, handleError, t } = useAnalytics()
const { selectedRange, dateRange } = useTimeRange()
const { singular, plural } = useSpeciesTerms()
const sp = computed(() => ({ animal: singular.value, animals: plural.value }))

function toggleChip(e) {
  const chip = e.target.closest('.stat-chip')
  if (chip) chip.classList.toggle('expanded')
}

// ── State ─────────────────────────────────────────────

const summaryLoading = ref(true)
const herdSummary = ref({
  total: 0,
  by_status: [],
  milking_count: 0,
  dry_count: 0,
  heifer_count: 0,
  males: 0,
  females: 0,
  replacement_rate: 0,
})

const ageLoading = ref(true)
const ageData = ref(null)
const avgAge = ref(null)

const breedLoading = ref(true)
const breedData = ref(null)

const turnoverLoading = ref(true)
const turnoverData = ref(null)

const mortalityLoading = ref(true)
const mortalityData = ref(null)

const trendLoading = ref(true)
const trendData = ref(null)

// ── Computed ──────────────────────────────────────────

const replacementRateClass = computed(() => {
  const r = herdSummary.value.replacement_rate
  if (r < 15) return 'danger'
  if (r < 25) return 'warn'
  return ''
})

const turnoverRate = computed(() => {
  if (!turnoverData.value || herdSummary.value.total === 0) return null
  return Math.round((turnoverData.value.total_removals / herdSummary.value.total) * 100 * 100) / 100
})

const turnoverRateClass = computed(() => {
  const r = turnoverRate.value
  if (r == null) return ''
  if (r > 8) return 'danger'
  if (r > 5) return 'warn'
  return ''
})

// ── Chart options ────────────────────────────────────

const statusColors = {
  active: chartColors.primary,
  dry: chartColors.info,
  pregnant: chartColors.purple,
  sick: chartColors.warning,
  sold: '#9CA3AF',
  dead: chartColors.danger,
}

const doughnutColors = [
  chartColors.primary,
  chartColors.info,
  chartColors.purple,
  chartColors.warning,
  chartColors.danger,
  '#F59E0B',
  '#EC4899',
  '#14B8A6',
]

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'bottom' },
  },
}

const stackedBarOptions = {
  ...barChartOptions,
  plugins: { legend: { display: true, position: 'bottom' } },
  scales: {
    ...barChartOptions.scales,
    x: { ...barChartOptions.scales.x, stacked: true },
    y: { ...barChartOptions.scales.y, stacked: true },
  },
}

const mortalityOptions = computed(() => ({
  ...barChartOptions,
  plugins: {
    legend: { display: true, position: 'bottom' },
  },
  scales: {
    ...barChartOptions.scales,
    x: { ...barChartOptions.scales.x, stacked: true },
    y: { ...barChartOptions.scales.y, stacked: true },
  },
}))

// ── Chart data ────────────────────────────────────────

const statusChart = computed(() => ({
  labels: herdSummary.value.by_status.map((s) => s.status),
  datasets: [
    {
      data: herdSummary.value.by_status.map((s) => s.count),
      backgroundColor: herdSummary.value.by_status.map((s) => statusColors[s.status] || '#9CA3AF'),
    },
  ],
}))

const ageChart = computed(() => ({
  labels: (ageData.value?.brackets || []).map((b) => b.label),
  datasets: [
    {
      label: t('analytics.structure.males'),
      data: (ageData.value?.brackets || []).map((b) => b.males),
      backgroundColor: chartColors.info,
      borderRadius: 4,
    },
    {
      label: t('analytics.structure.females'),
      data: (ageData.value?.brackets || []).map((b) => b.females),
      backgroundColor: chartColors.primary,
      borderRadius: 4,
    },
  ],
}))

const breedChart = computed(() => ({
  labels: (breedData.value?.breeds || []).map((b) => b.name),
  datasets: [
    {
      data: (breedData.value?.breeds || []).map((b) => b.count),
      backgroundColor: doughnutColors.slice(0, (breedData.value?.breeds || []).length),
    },
  ],
}))

const turnoverChart = computed(() => ({
  labels: (turnoverData.value?.months || []).map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: t('analytics.structure.additions'),
      data: (turnoverData.value?.months || []).map((m) => m.additions),
      backgroundColor: chartColors.primary,
      borderRadius: 4,
    },
    {
      label: t('analytics.structure.removals'),
      data: (turnoverData.value?.months || []).map((m) => m.removals),
      backgroundColor: chartColors.danger,
      borderRadius: 4,
    },
  ],
}))

const mortalityChart = computed(() => ({
  labels: (mortalityData.value?.months || []).map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: t('analytics.structure.sold'),
      data: (mortalityData.value?.months || []).map((m) => m.sold),
      backgroundColor: chartColors.warning,
      borderRadius: 4,
    },
    {
      label: t('analytics.structure.dead'),
      data: (mortalityData.value?.months || []).map((m) => m.dead),
      backgroundColor: chartColors.danger,
      borderRadius: 4,
    },
  ],
}))

const trendChart = computed(() => ({
  labels: (trendData.value?.months || []).map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: t('analytics.structure.herdSizeTrend'),
      data: (trendData.value?.months || []).map((m) => m.total),
      borderColor: chartColors.primary,
      backgroundColor: chartColors.primaryLight,
      fill: true,
      tension: 0.3,
    },
  ],
}))

// ── Fetch data ────────────────────────────────────────

function buildParams() {
  const { from, to } = dateRange.value
  return `?from=${from}&to=${to}`
}

function loadData() {
  const params = buildParams()

  turnoverLoading.value = true
  mortalityLoading.value = true
  trendLoading.value = true

  api
    .get(`/analytics/herd-turnover${params}`)
    .then((r) => {
      turnoverData.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      turnoverLoading.value = false
    })

  api
    .get(`/analytics/mortality-rate${params}`)
    .then((r) => {
      mortalityData.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      mortalityLoading.value = false
    })

  api
    .get(`/analytics/herd-size-trend${params}`)
    .then((r) => {
      trendData.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      trendLoading.value = false
    })
}

onMounted(() => {
  // Snapshot endpoints — fetch once, not affected by time range
  api
    .get('/analytics/herd-summary')
    .then((r) => {
      herdSummary.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      summaryLoading.value = false
    })

  api
    .get('/analytics/age-distribution')
    .then((r) => {
      ageData.value = r.data
      const midpoints = { '0-1yr': 0.5, '1-2yr': 1.5, '2-5yr': 3.5, '5-8yr': 6.5, '8+yr': 10 }
      let totalAge = 0
      let known = 0
      for (const b of r.data.brackets) {
        if (b.label !== 'Unknown' && b.count > 0) {
          totalAge += midpoints[b.label] * b.count
          known += b.count
        }
      }
      avgAge.value = known > 0 ? Math.round((totalAge / known) * 10) / 10 : null
    })
    .catch(handleError)
    .finally(() => {
      ageLoading.value = false
    })

  api
    .get('/analytics/breed-composition')
    .then((r) => {
      breedData.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      breedLoading.value = false
    })

  // Time-sensitive endpoints — initial load
  loadData()
})

watch(selectedRange, loadData)
</script>
