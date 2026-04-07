<template>
  <div class="page">
    <AppHeader :title="t('analytics.fertility.title')" show-back back-to="/analytics" />

    <div class="page-content">
      <div v-if="offline" class="offline-banner">
        <span>📡</span>
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
        <!-- 1. Stat Chips (6) -->
        <section class="analytics-card">
          <div v-if="overviewLoading || conceptionLoading" class="center-spinner">
            <div class="spinner" />
          </div>
          <div v-else class="stat-chips" @click="toggleChip">
            <div class="stat-chip">
              <span class="stat-value mono">{{ breedingData?.pregnant_count ?? '—' }}</span>
              <span class="stat-label">{{ t('analytics.pregnantCount') }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono">{{ breedingData?.not_pregnant_count ?? '—' }}</span>
              <span class="stat-label">{{ t('analytics.notPregnantCount') }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono">{{
                conceptionData?.first_service_rate != null
                  ? Math.round(conceptionData.first_service_rate) + '%'
                  : '—'
              }}</span>
              <span class="stat-label">{{ t('analytics.fertility.conceptionRate') }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono">{{
                breedingData?.avg_services_per_conception ?? '—'
              }}</span>
              <span class="stat-label">{{ t('analytics.servicesPerConception') }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono">{{
                breedingData?.pregnancy_rate != null
                  ? Math.round(breedingData.pregnancy_rate) + '%'
                  : '—'
              }}</span>
              <span class="stat-label">{{ t('analytics.pregnancyRate') }}</span>
            </div>
            <div class="stat-chip">
              <span class="stat-value mono">{{ breedingData?.abortion_count ?? '—' }}</span>
              <span class="stat-label">{{ t('analytics.abortionCount') }}</span>
            </div>
          </div>
        </section>

        <!-- 2. Repro Status Doughnut -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.fertility.reproStatus') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.fertility.reproStatusDesc') }}</p>
          <div v-if="overviewLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="hasReproData">
            <div class="chart-wrap doughnut-wrap">
              <Doughnut :data="reproChart" :options="doughnutOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 3. Calving Interval Histogram -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.fertility.calvingInterval') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.fertility.calvingIntervalDesc', sp) }}</p>
          <div v-if="calvingLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="calvingData && calvingData.intervals.length > 0">
            <p class="chart-subtitle mono">
              {{ t('analytics.fertility.avgCalvingInterval') }}:
              {{ calvingData.avg_calving_interval_days }} {{ t('analytics.fertility.days') }}
            </p>
            <div class="chart-wrap">
              <Bar :data="calvingHistogram" :options="calvingHistogramOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 4. Days Open Histogram -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.fertility.daysOpen') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.fertility.daysOpenDesc', sp) }}</p>
          <div v-if="daysOpenLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="daysOpenData && daysOpenData.records.length > 0">
            <p class="chart-subtitle mono">
              {{ t('analytics.fertility.avgDaysOpen') }}: {{ daysOpenData.avg_days_open }}
              {{ t('analytics.fertility.days') }}
            </p>
            <div class="chart-wrap">
              <Bar :data="daysOpenHistogram" :options="daysOpenHistogramOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 5. Breeding Activity -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.fertility.breedingActivity') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.fertility.breedingActivityDesc') }}</p>
          <div v-if="activityLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="activityData && activityData.months.length > 0">
            <div class="chart-wrap">
              <Bar :data="activityChart" :options="activityChartOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 6. Conception Rate Trend -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.fertility.conceptionTrend') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.fertility.conceptionTrendDesc', sp) }}</p>
          <div v-if="conceptionLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="conceptionData?.by_month?.length > 0">
            <div class="chart-wrap">
              <Line :data="conceptionTrendChart" :options="conceptionTrendOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 7. Expected Calvings -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.expectedCalvings') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.fertility.expectedCalvingsDesc') }}</p>
          <div v-if="overviewLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="breedingData && breedingData.calvings_by_month.length > 0">
            <div class="chart-wrap">
              <Bar :data="calvingsMonthChart" :options="barChartOptions" />
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
import { Bar, Doughnut, Line } from 'vue-chartjs'
import '../../utils/chartSetup.js'
import '../../assets/analytics.css'
import api from '../../services/api'
import AppHeader from '../../components/organisms/AppHeader.vue'
import {
  useAnalytics,
  chartColors,
  formatMonth,
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

const overviewLoading = ref(true)
const breedingData = ref(null)

const calvingLoading = ref(true)
const calvingData = ref(null)

const daysOpenLoading = ref(true)
const daysOpenData = ref(null)

const conceptionLoading = ref(true)
const conceptionData = ref(null)

const activityLoading = ref(true)
const activityData = ref(null)

// ── Histogram bucketing helper ────────────────────────

function bucketize(values, bucketDefs) {
  const counts = new Array(bucketDefs.length).fill(0)
  for (const val of values) {
    for (let i = 0; i < bucketDefs.length; i++) {
      const { min, max } = bucketDefs[i]
      if (val >= min && (max === Infinity || val < max)) {
        counts[i]++
        break
      }
    }
  }
  return counts
}

// ── Histogram bucket definitions ──────────────────────

const calvingBuckets = [
  { label: '<365', min: 0, max: 365 },
  { label: '365–400', min: 365, max: 400 },
  { label: '400–450', min: 400, max: 450 },
  { label: '450–500', min: 450, max: 500 },
  { label: '500+', min: 500, max: Infinity },
]
const calvingBucketColors = [
  chartColors.primary,
  chartColors.primary,
  chartColors.warning,
  chartColors.danger,
  chartColors.danger,
]

const daysOpenBuckets = [
  { label: '<60', min: 0, max: 60 },
  { label: '60–90', min: 60, max: 90 },
  { label: '90–120', min: 90, max: 120 },
  { label: '120–150', min: 120, max: 150 },
  { label: '150–200', min: 150, max: 200 },
  { label: '200+', min: 200, max: Infinity },
]
const daysOpenBucketColors = [
  chartColors.primary,
  chartColors.primary,
  chartColors.primary,
  chartColors.warning,
  chartColors.danger,
  chartColors.danger,
]

// ── Doughnut options ──────────────────────────────────

const reproColors = [
  chartColors.primary,
  chartColors.warning,
  chartColors.info,
  '#9CA3AF',
  chartColors.purple,
]

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: { boxWidth: 10, padding: 8, font: { size: 10 } },
    },
  },
}

// ── Chart data: Repro Status Doughnut ─────────────────

const hasReproData = computed(() => {
  if (!breedingData.value?.repro_status) return false
  const rs = breedingData.value.repro_status
  return rs.pregnant + rs.not_pregnant + rs.bred_awaiting_check + rs.dry + rs.heifer_not_bred > 0
})

const reproChart = computed(() => ({
  labels: [
    t('analytics.fertility.pregnant'),
    t('analytics.fertility.notPregnant'),
    t('analytics.fertility.bredAwaitingCheck'),
    t('analytics.fertility.dry'),
    t('analytics.fertility.heiferNotBred'),
  ],
  datasets: [
    {
      data: breedingData.value?.repro_status
        ? [
            breedingData.value.repro_status.pregnant,
            breedingData.value.repro_status.not_pregnant,
            breedingData.value.repro_status.bred_awaiting_check,
            breedingData.value.repro_status.dry,
            breedingData.value.repro_status.heifer_not_bred,
          ]
        : [],
      backgroundColor: reproColors,
      borderWidth: 2,
      borderColor: '#fff',
    },
  ],
}))

// ── Chart data: Calving Interval Histogram ────────────

const calvingHistogram = computed(() => {
  const values = (calvingData.value?.intervals || []).map((c) => c.interval_days)
  const counts = bucketize(values, calvingBuckets)
  return {
    labels: calvingBuckets.map((b) => b.label),
    datasets: [
      {
        label: t('analytics.fertility.calvingInterval'),
        data: counts,
        backgroundColor: calvingBucketColors,
        borderRadius: 4,
      },
    ],
  }
})

const calvingHistogramOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: t('analytics.fertility.cows', sp.value), font: { size: 10 } },
      ticks: { stepSize: 1, font: { family: "'JetBrains Mono', monospace", size: 11 } },
      grid: { color: 'rgba(0,0,0,0.06)' },
    },
    x: {
      title: { display: true, text: t('analytics.fertility.days'), font: { size: 10 } },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
      grid: { display: false },
    },
  },
}))

// ── Chart data: Days Open Histogram ───────────────────

const daysOpenHistogram = computed(() => {
  const values = (daysOpenData.value?.records || []).map((c) => c.days_open)
  const counts = bucketize(values, daysOpenBuckets)
  return {
    labels: daysOpenBuckets.map((b) => b.label),
    datasets: [
      {
        label: t('analytics.fertility.daysOpen'),
        data: counts,
        backgroundColor: daysOpenBucketColors,
        borderRadius: 4,
      },
    ],
  }
})

const daysOpenHistogramOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: t('analytics.fertility.cows', sp.value), font: { size: 10 } },
      ticks: { stepSize: 1, font: { family: "'JetBrains Mono', monospace", size: 11 } },
      grid: { color: 'rgba(0,0,0,0.06)' },
    },
    x: {
      title: { display: true, text: t('analytics.fertility.days'), font: { size: 10 } },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
      grid: { display: false },
    },
  },
}))

// ── Chart data: Breeding Activity ─────────────────────

const activityChart = computed(() => ({
  labels: (activityData.value?.months || []).map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: t('analytics.fertility.inseminations'),
      data: (activityData.value?.months || []).map((m) => m.inseminations),
      backgroundColor: chartColors.purple,
      borderRadius: 4,
    },
    {
      label: t('analytics.fertility.conceptions'),
      data: (activityData.value?.months || []).map((m) => m.conceptions),
      backgroundColor: chartColors.primary,
      borderRadius: 4,
    },
  ],
}))

const activityChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: { boxWidth: 10, padding: 8, font: { size: 10 } },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(0,0,0,0.06)' },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
    },
    x: {
      grid: { display: false },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
    },
  },
}

// ── Chart data: Conception Rate Trend ─────────────────

const conceptionTrendChart = computed(() => ({
  labels: (conceptionData.value?.by_month || []).map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: t('analytics.fertility.conceptionRate'),
      data: (conceptionData.value?.by_month || []).map((m) => m.rate),
      borderColor: chartColors.primary,
      backgroundColor: chartColors.primaryLight,
      fill: true,
      tension: 0.3,
      pointRadius: 4,
      pointBackgroundColor: chartColors.primary,
    },
  ],
}))

const conceptionTrendOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 100,
      title: { display: true, text: '%', font: { size: 10 } },
      ticks: {
        callback: (v) => v + '%',
        font: { family: "'JetBrains Mono', monospace", size: 11 },
      },
      grid: { color: 'rgba(0,0,0,0.06)' },
    },
    x: {
      grid: { display: false },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
    },
  },
}))

// ── Chart data: Expected Calvings (unchanged) ─────────

const calvingsMonthChart = computed(() => ({
  labels: (breedingData.value?.calvings_by_month || []).map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: t('analytics.expectedCalvings'),
      data: (breedingData.value?.calvings_by_month || []).map((m) => m.count),
      backgroundColor: chartColors.purple,
      borderRadius: 4,
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

  overviewLoading.value = true
  conceptionLoading.value = true
  daysOpenLoading.value = true
  activityLoading.value = true
  calvingLoading.value = true

  api
    .get(`/analytics/breeding-overview${params}`)
    .then((r) => {
      breedingData.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      overviewLoading.value = false
    })

  api
    .get(`/analytics/conception-rate${params}`)
    .then((r) => {
      conceptionData.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      conceptionLoading.value = false
    })

  api
    .get(`/analytics/days-open${params}`)
    .then((r) => {
      daysOpenData.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      daysOpenLoading.value = false
    })

  api
    .get(`/analytics/breeding-activity${params}`)
    .then((r) => {
      activityData.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      activityLoading.value = false
    })

  api
    .get(`/analytics/calving-interval${params}`)
    .then((r) => {
      calvingData.value = r.data
    })
    .catch(handleError)
    .finally(() => {
      calvingLoading.value = false
    })
}

onMounted(loadData)

watch(selectedRange, loadData)
</script>
