<template>
  <div class="page">
    <AppHeader :title="t('analytics.health.title')" show-back back-to="/analytics" />

    <div class="page-content">
      <div v-if="offline" class="offline-banner">
        <span>📡</span>
        <span>{{ t('analytics.connectToView') }}</span>
      </div>

      <div v-if="!offline" class="filter-chips">
        <button v-for="opt in TIME_RANGE_OPTIONS" :key="opt.value"
          class="chip" :class="{ active: selectedRange === opt.value }"
          @click="selectedRange = opt.value"
        >{{ t(opt.labelKey) }}</button>
      </div>

      <template v-if="!offline">
        <!-- 1. Stat Chips -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <div v-if="statsLoading || resolutionStatsLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else>
            <div class="stat-chips">
              <div class="stat-chip">
                <span class="stat-value mono">{{ activeIssues }}</span>
                <span class="stat-label">{{ t('analytics.health.openIssues') }}</span>
              </div>
              <div class="stat-chip">
                <span class="stat-value mono">{{ resolutionStats?.cure_rate != null ? resolutionStats.cure_rate + '%' : '—' }}</span>
                <span class="stat-label">{{ t('analytics.health.cureRate') }}</span>
              </div>
              <div class="stat-chip">
                <span class="stat-value mono" :class="{ warn: resolutionStats?.avg_days_to_resolve > 7 }">{{ resolutionStats?.avg_days_to_resolve != null ? resolutionStats.avg_days_to_resolve + 'd' : '—' }}</span>
                <span class="stat-label">{{ t('analytics.health.avgDaysToResolve') }}</span>
              </div>
              <div class="stat-chip">
                <span class="stat-value mono" :class="{ danger: resolutionStats?.recurrence_rate > 15 }">{{ resolutionStats?.recurrence_rate != null ? resolutionStats.recurrence_rate + '%' : '—' }}</span>
                <span class="stat-label">{{ t('analytics.health.recurrenceRate') }}</span>
              </div>
            </div>
            <!-- Top 3 Incidence sub-panel -->
            <div v-if="resolutionStats?.top_incidence?.length" class="incidence-panel">
              <p class="panel-label">{{ t('analytics.health.topIncidence') }} <span style="text-transform: none; letter-spacing: normal; font-weight: 400;">({{ t('analytics.health.topIncidenceDesc') }})</span></p>
              <div class="stat-chips-3col">
                <div v-for="inc in resolutionStats.top_incidence" :key="inc.code" class="stat-chip">
                  <span class="stat-value mono" :class="incidenceColor(inc.rate)">{{ inc.rate }}</span>
                  <span class="stat-label">{{ inc.emoji }} {{ inc.name }}</span>
                </div>
              </div>
            </div>
          </template>
        </section>

        <!-- 2. Issue Frequency by Type -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.issueFrequency') }}</h2>
          <div v-if="freqLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="frequencyData && frequencyData.by_type.length > 0">
            <div class="chart-wrap">
              <Bar :data="frequencyChart" :options="horizontalBarOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 3. Resolution Time by Type (NEW) -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.resolutionByType') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.health.resolutionByTypeDesc') }}</p>
          <div v-if="resolutionByTypeLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="resolutionByTypeData && resolutionByTypeData.by_type.length > 0">
            <div class="chart-wrap">
              <Bar :data="resolutionByTypeChart" :options="resolutionByTypeOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 4. Cure Rate Trend (NEW) -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.cureRateTrend') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.health.cureRateTrendDesc') }}</p>
          <div v-if="cureRateTrendLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="cureRateTrendData && cureRateTrendData.months.length > 0">
            <div class="chart-wrap">
              <Line :data="cureRateTrendChart" :options="cureRateTrendOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 5. Recurrence Rate by Type (NEW) -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.recurrenceByType') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.health.recurrenceByTypeDesc') }}</p>
          <div v-if="recurrenceLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="recurrenceData && recurrenceData.by_type.length > 0">
            <div class="chart-wrap">
              <Bar :data="recurrenceChart" :options="recurrenceOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 6. Issue Trend by Month -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.issueTrend') }}</h2>
          <div v-if="freqLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="frequencyData && frequencyData.by_month.length > 0">
            <div class="chart-wrap">
              <Bar :data="trendChart" :options="stackedBarOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 7. Top 3 Disease Incidence Trend (IMPROVED) -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.incidenceTrend') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.health.incidenceTrendDesc') }}</p>
          <div v-if="freqLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="incidenceTrendChart.datasets.length > 0">
            <div class="chart-wrap">
              <Line :data="incidenceTrendChart" :options="incidenceTrendOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 8. Treatment Cost per Cow (IMPROVED) -->
        <section v-if="flags.treatments" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.treatmentCostPerCow') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.health.treatmentCostPerCowDesc') }}</p>
          <div v-if="costsLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="costPerCowChart.labels.length > 0">
            <div class="chart-wrap">
              <Bar :data="costPerCowChart" :options="barChartOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 9. Slowest to Resolve (NEW) -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.slowestToResolve') }}</h2>
          <p class="chart-subtitle">{{ t('analytics.health.slowestToResolveDesc') }}</p>
          <div v-if="slowestLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="slowestCows.length > 0">
            <div class="cow-list">
              <RouterLink
                v-for="(cow, i) in slowestCows"
                :key="cow.id"
                :to="`/cows/${cow.id}`"
                class="cow-item"
              >
                <span class="cow-rank mono">{{ i + 1 }}</span>
                <span class="mono cow-tag">{{ cow.tag_number }}</span>
                <span class="cow-name">{{ cow.name || '—' }}</span>
                <span class="cow-days mono">{{ cow.avg_days }} {{ t('analytics.health.daysAvg') }}</span>
              </RouterLink>
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 10. Unhealthiest Cows -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.unhealthiestCows') }}</h2>
          <div v-if="unhealthiestLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="unhealthiest.length > 0">
            <div class="cow-list">
              <RouterLink
                v-for="(cow, i) in unhealthiest"
                :key="cow.id"
                :to="`/cows/${cow.id}`"
                class="cow-item"
              >
                <span class="cow-rank mono">{{ i + 1 }}</span>
                <span class="mono cow-tag">{{ cow.tag_number }}</span>
                <span class="cow-name">{{ cow.name || '—' }}</span>
                <span class="cow-count mono warn">{{ cow.issue_count }}</span>
              </RouterLink>
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- 11. Seasonal Predictions -->
        <section v-if="flags.healthIssues" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.health.seasonalPredictions') }}</h2>
          <div v-if="predLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="predictions.predictions && predictions.predictions.length > 0">
            <p class="chart-subtitle">
              {{ t('analytics.health.yearsOfData', { count: predictions.years_of_data }) }}
            </p>
            <div class="prediction-cards">
              <div v-for="pred in predictions.predictions" :key="pred.month" class="prediction-card">
                <h3 class="prediction-month">{{ pred.month_name }}</h3>
                <div v-for="issue in pred.issues" :key="issue.code" class="prediction-issue">
                  <span>{{ issue.emoji }}</span>
                  <span class="prediction-type">{{ issue.type }}</span>
                  <span class="mono prediction-avg">{{ issue.historical_avg }} {{ t('analytics.health.avg') }}{{ t('analytics.health.perMonth') }}</span>
                </div>
                <div v-if="pred.issues.length === 0" class="empty-state-mini">{{ t('analytics.noData') }}</div>
              </div>
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Line, Bar } from 'vue-chartjs'
import '../../utils/chartSetup.js'
import '../../assets/analytics.css'
import api from '../../services/api.js'
import AppHeader from '../../components/organisms/AppHeader.vue'
import {
  useAnalytics, chartColors, formatMonth,
  barChartOptions, horizontalBarOptions,
  useTimeRange, TIME_RANGE_OPTIONS,
  horizontalAnnotation, verticalAnnotation,
} from '../../composables/useAnalytics.js'

const { offline, flags, handleError, t } = useAnalytics()
const { selectedRange, dateRange } = useTimeRange()

// ── State ─────────────────────────────────────────────

const statsLoading = ref(true)
const activeIssues = ref(0)

const resolutionStatsLoading = ref(true)
const resolutionStats = ref(null)

const freqLoading = ref(true)
const frequencyData = ref(null)

const resolutionByTypeLoading = ref(true)
const resolutionByTypeData = ref(null)

const cureRateTrendLoading = ref(true)
const cureRateTrendData = ref(null)

const recurrenceLoading = ref(true)
const recurrenceData = ref(null)

const costsLoading = ref(true)
const costsData = ref(null)

const unhealthiestLoading = ref(true)
const unhealthiest = ref([])

const slowestLoading = ref(true)
const slowestCows = ref([])

const predLoading = ref(true)
const predictions = ref({ predictions: [], years_of_data: 0 })

const herdSize = ref(0)

// ── Chart colors for issue types ─────────────────────

const issueColors = [
  chartColors.danger, chartColors.warning, chartColors.info,
  chartColors.purple, chartColors.primary, '#F59E0B', '#EC4899', '#14B8A6',
]

// ── Helpers ──────────────────────────────────────────

function incidenceColor(rate) {
  if (rate > 8) return 'danger'
  if (rate > 4) return 'warn'
  return ''
}

// ── Chart data ────────────────────────────────────────

const frequencyChart = computed(() => ({
  labels: (frequencyData.value?.by_type || []).map(t => `${t.emoji} ${t.name}`),
  datasets: [{
    label: t('analytics.health.issueFrequency'),
    data: (frequencyData.value?.by_type || []).map(t => t.count),
    backgroundColor: chartColors.danger,
    borderRadius: 4,
  }],
}))

const trendChart = computed(() => {
  const months = frequencyData.value?.by_month || []
  const allCodes = new Set()
  months.forEach(m => Object.keys(m.counts).forEach(c => allCodes.add(c)))
  const codes = [...allCodes]

  const datasets = codes.map((code, i) => ({
    label: code,
    data: months.map(m => m.counts[code] || 0),
    backgroundColor: issueColors[i % issueColors.length],
    borderRadius: 4,
  }))

  return {
    labels: months.map(m => formatMonth(m.month)),
    datasets,
  }
})

const stackedBarOptions = {
  ...barChartOptions,
  scales: {
    ...barChartOptions.scales,
    y: { ...barChartOptions.scales.y, stacked: true },
    x: { ...barChartOptions.scales.x, stacked: true },
  },
  plugins: {
    legend: { display: true, position: 'bottom', labels: { boxWidth: 10, padding: 6, font: { size: 9 } } },
  },
}

// 3. Resolution by type — horizontal bar with color-coded bars + target annotation
const resolutionByTypeChart = computed(() => {
  const items = resolutionByTypeData.value?.by_type || []
  return {
    labels: items.map(t => `${t.emoji} ${t.name}`),
    datasets: [{
      data: items.map(t => t.avg_days),
      backgroundColor: items.map(t =>
        t.avg_days > 7 ? chartColors.danger : t.avg_days > 5 ? chartColors.warning : chartColors.primary
      ),
      borderRadius: 4,
    }],
  }
})

const resolutionByTypeOptions = computed(() => ({
  ...horizontalBarOptions,
  plugins: {
    legend: { display: false },
    annotation: {
      annotations: {
        target: verticalAnnotation(7, t('analytics.health.target7d'), chartColors.danger),
      },
    },
  },
  scales: {
    ...horizontalBarOptions.scales,
    x: {
      ...horizontalBarOptions.scales?.x,
      beginAtZero: true,
      title: { display: true, text: t('analytics.fertility.days'), font: { size: 10 } },
    },
  },
}))

// 4. Cure rate trend — line chart with 80% target
const cureRateTrendChart = computed(() => ({
  labels: (cureRateTrendData.value?.months || []).map(m => formatMonth(m.month)),
  datasets: [{
    label: t('analytics.health.cureRate'),
    data: (cureRateTrendData.value?.months || []).map(m => m.rate),
    borderColor: chartColors.primary,
    backgroundColor: chartColors.primaryLight,
    fill: true,
    tension: 0.3,
    pointRadius: 4,
    pointBackgroundColor: chartColors.primary,
  }],
}))

const cureRateTrendOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    annotation: {
      annotations: {
        target: horizontalAnnotation(80, t('analytics.health.target80pct'), chartColors.warning),
      },
    },
  },
  scales: {
    y: {
      min: 0,
      max: 100,
      grid: { color: 'rgba(0,0,0,0.06)' },
      ticks: {
        callback: v => v + '%',
        font: { family: "'JetBrains Mono', monospace", size: 11 },
      },
    },
    x: {
      grid: { display: false },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
    },
  },
}))

// 5. Recurrence by type — horizontal bar with concern line
const recurrenceChart = computed(() => {
  const items = recurrenceData.value?.by_type || []
  return {
    labels: items.map(t => `${t.emoji} ${t.name}`),
    datasets: [{
      data: items.map(t => t.rate),
      backgroundColor: items.map(t =>
        t.rate > 15 ? chartColors.danger : t.rate > 10 ? chartColors.warning : chartColors.primary
      ),
      borderRadius: 4,
    }],
  }
})

const recurrenceOptions = computed(() => ({
  ...horizontalBarOptions,
  plugins: {
    legend: { display: false },
    annotation: {
      annotations: {
        concern: verticalAnnotation(10, t('analytics.health.concern10pct'), chartColors.danger),
      },
    },
  },
  scales: {
    ...horizontalBarOptions.scales,
    x: {
      ...horizontalBarOptions.scales?.x,
      beginAtZero: true,
      ticks: {
        callback: v => v + '%',
        font: { family: "'JetBrains Mono', monospace", size: 11 },
      },
    },
  },
}))

// 7. Top 3 incidence trend — multi-line from issue-frequency data
const incidenceTrendChart = computed(() => {
  const byType = frequencyData.value?.by_type || []
  const byMonth = frequencyData.value?.by_month || []
  if (byType.length === 0 || byMonth.length === 0 || herdSize.value === 0) {
    return { labels: [], datasets: [] }
  }

  const top3 = byType.slice(0, 3)
  const lineColors = [chartColors.danger, chartColors.warning, chartColors.info]

  const datasets = top3.map((type, i) => ({
    label: `${type.emoji} ${type.name}`,
    data: byMonth.map(m => {
      const count = m.counts[type.code] || 0
      return Math.round((count / herdSize.value) * 100 * 100) / 100
    }),
    borderColor: lineColors[i],
    backgroundColor: 'transparent',
    tension: 0.3,
    pointRadius: 3,
  }))

  return {
    labels: byMonth.map(m => formatMonth(m.month)),
    datasets,
  }
})

const incidenceTrendOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'bottom', labels: { boxWidth: 10, padding: 6, font: { size: 9 } } },
  },
  scales: {
    y: {
      beginAtZero: true,
      title: { display: true, text: t('analytics.health.per100'), font: { size: 10 } },
      grid: { color: 'rgba(0,0,0,0.06)' },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
    },
    x: {
      grid: { display: false },
      ticks: { font: { family: "'JetBrains Mono', monospace", size: 11 } },
    },
  },
}

// 8. Treatment cost per cow — bar with color-coded bars
const costPerCowChart = computed(() => {
  const months = costsData.value?.months || []
  if (months.length === 0 || herdSize.value === 0) {
    return { labels: [], datasets: [] }
  }

  const perCow = months.map(m => Math.round((m.total_cost / herdSize.value) * 100) / 100)

  return {
    labels: months.map(m => formatMonth(m.month)),
    datasets: [{
      label: t('analytics.health.costPerCowUnit'),
      data: perCow,
      backgroundColor: perCow.map(v =>
        v > 50 ? chartColors.danger : v > 40 ? chartColors.warning : chartColors.primary
      ),
      borderRadius: 4,
    }],
  }
})

// ── Fetch data ────────────────────────────────────────

function buildParams() {
  const { from, to } = dateRange.value
  return `?from=${from}&to=${to}`
}

function loadData() {
  const params = buildParams()

  if (flags.value.healthIssues) {
    freqLoading.value = true
    resolutionStatsLoading.value = true
    resolutionByTypeLoading.value = true
    cureRateTrendLoading.value = true
    recurrenceLoading.value = true
    unhealthiestLoading.value = true
    slowestLoading.value = true

    api.get(`/analytics/issue-frequency${params}`)
      .then(r => { frequencyData.value = r.data })
      .catch(handleError)
      .finally(() => { freqLoading.value = false })

    api.get(`/analytics/health-resolution-stats${params}`)
      .then(r => { resolutionStats.value = r.data })
      .catch(handleError)
      .finally(() => { resolutionStatsLoading.value = false })

    api.get(`/analytics/health-resolution-by-type${params}`)
      .then(r => { resolutionByTypeData.value = r.data })
      .catch(handleError)
      .finally(() => { resolutionByTypeLoading.value = false })

    api.get(`/analytics/health-cure-rate-trend${params}`)
      .then(r => { cureRateTrendData.value = r.data })
      .catch(handleError)
      .finally(() => { cureRateTrendLoading.value = false })

    api.get(`/analytics/health-recurrence${params}`)
      .then(r => { recurrenceData.value = r.data })
      .catch(handleError)
      .finally(() => { recurrenceLoading.value = false })

    api.get(`/analytics/unhealthiest${params}`)
      .then(r => { unhealthiest.value = r.data || [] })
      .catch(handleError)
      .finally(() => { unhealthiestLoading.value = false })

    api.get(`/analytics/slowest-to-resolve${params}`)
      .then(r => { slowestCows.value = r.data || [] })
      .catch(handleError)
      .finally(() => { slowestLoading.value = false })
  } else {
    freqLoading.value = false
    resolutionStatsLoading.value = false
    resolutionByTypeLoading.value = false
    cureRateTrendLoading.value = false
    recurrenceLoading.value = false
    unhealthiestLoading.value = false
    slowestLoading.value = false
  }

  if (flags.value.treatments) {
    costsLoading.value = true
    api.get(`/analytics/treatment-costs${params}`)
      .then(r => { costsData.value = r.data })
      .catch(handleError)
      .finally(() => { costsLoading.value = false })
  } else {
    costsLoading.value = false
  }
}

onMounted(() => {
  // Snapshot endpoints — fetch once, not affected by time range
  if (flags.value.healthIssues) {
    api.get('/analytics/daily-kpis')
      .then(r => { activeIssues.value = r.data.active_health_issues || 0 })
      .catch(handleError)
      .finally(() => { statsLoading.value = false })

    api.get('/analytics/seasonal-prediction')
      .then(r => { predictions.value = r.data || { predictions: [], years_of_data: 0 } })
      .catch(handleError)
      .finally(() => { predLoading.value = false })

    api.get('/analytics/herd-summary')
      .then(r => { herdSize.value = r.data.total || 0 })
      .catch(handleError)
  } else {
    statsLoading.value = false
    predLoading.value = false
  }

  // Time-sensitive endpoints — initial load
  loadData()
})

watch(selectedRange, loadData)
</script>
