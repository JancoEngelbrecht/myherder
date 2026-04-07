<template>
  <div class="page">
    <AppHeader :title="t('analytics.financial.title')" show-back back-to="/analytics" />

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
        <!-- Litres per Cow per Day -->
        <section v-if="flags.milkRecording" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.financial.litresPerCow', sp) }}</h2>
          <div v-if="litresLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="litresPerCow.length > 0">
            <div class="chart-wrap">
              <Line :data="litresPerCowChart" :options="lineChartOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Revenue per Month -->
        <section v-if="flags.milkRecording" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.financial.revenue') }}</h2>
          <div v-if="milkLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="milkTrends.length > 0 && milkPrice > 0">
            <p class="chart-subtitle mono">
              {{ t('analytics.financial.revenueSubtitle', { price: milkPrice }) }}
            </p>
            <div class="chart-wrap">
              <Bar :data="revenueChart" :options="barChartOptions" />
            </div>
          </template>
          <div v-else-if="milkTrends.length > 0 && milkPrice === 0" class="empty-state-mini">
            {{ t('analytics.financial.noMilkPrice') }}
          </div>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Treatment Cost per Cow -->
        <section v-if="flags.treatments" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.financial.treatmentCostPerCow', sp) }}</h2>
          <div v-if="costLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="treatmentCosts.months && treatmentCosts.months.length > 0">
            <p class="chart-subtitle mono">
              {{ t('analytics.totalSpend') }}: R{{ Number(treatmentCosts.grand_total).toFixed(2) }}
            </p>
            <div class="chart-wrap">
              <Bar :data="costPerCowChart" :options="barChartOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Wasted Milk Value -->
        <section v-if="flags.milkRecording && flags.treatments" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.financial.wastedMilkValue') }}</h2>
          <div v-if="wastedLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="wastedMilk.months && wastedMilk.months.length > 0">
            <p class="chart-subtitle mono">
              {{ t('analytics.discardedTotal') }}: {{ wastedMilk.total_discarded }} L
              <template v-if="milkPrice > 0">
                (R{{ Math.round(wastedMilk.total_discarded * milkPrice) }})</template
              >
            </p>
            <div class="chart-wrap">
              <Bar :data="wastedChart" :options="barChartOptions" />
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Top Producers -->
        <section v-if="flags.milkRecording" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.topProducers') }}</h2>
          <div v-if="producersLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="topProducers.length > 0">
            <div class="chart-wrap">
              <Bar :data="topChart" :options="horizontalBarOptions" />
            </div>
            <div class="producers-list">
              <RouterLink
                v-for="(cow, i) in topProducers"
                :key="cow.id"
                :to="`/animals/${cow.id}`"
                class="producer-item"
              >
                <span class="producer-rank mono">{{ i + 1 }}</span>
                <span class="mono producer-tag">{{ cow.tag_number }}</span>
                <span class="producer-name">{{ cow.name || '—' }}</span>
                <span class="producer-avg mono">{{ cow.avg_daily_litres }} L/d</span>
              </RouterLink>
            </div>
          </template>
          <div v-else class="empty-state-mini">{{ t('analytics.noData') }}</div>
        </section>

        <!-- Bottom Producers -->
        <section v-if="flags.milkRecording" class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.financial.bottomProducers') }}</h2>
          <div v-if="bottomLoading" class="center-spinner"><div class="spinner" /></div>
          <template v-else-if="bottomProducers.length > 0">
            <div class="chart-wrap">
              <Bar :data="bottomChart" :options="horizontalBarOptions" />
            </div>
            <div class="producers-list">
              <RouterLink
                v-for="(cow, i) in bottomProducers"
                :key="cow.id"
                :to="`/animals/${cow.id}`"
                class="producer-item"
              >
                <span class="producer-rank mono">{{ i + 1 }}</span>
                <span class="mono producer-tag">{{ cow.tag_number }}</span>
                <span class="producer-name">{{ cow.name || '—' }}</span>
                <span class="producer-avg mono warn">{{ cow.avg_daily_litres }} L/d</span>
              </RouterLink>
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
import { Line, Bar } from 'vue-chartjs'
import '../../utils/chartSetup.js'
import '../../assets/analytics.css'
import api from '../../services/api'
import AppHeader from '../../components/organisms/AppHeader.vue'
import {
  useAnalytics,
  chartColors,
  formatMonth,
  lineChartOptions,
  barChartOptions,
  horizontalBarOptions,
  useTimeRange,
  TIME_RANGE_OPTIONS,
} from '../../composables/useAnalytics'

const { offline, flags, handleError, t } = useAnalytics()
const { selectedRange, dateRange } = useTimeRange()
const { singular, plural } = useSpeciesTerms()
const sp = computed(() => ({ animal: singular.value, animals: plural.value }))

// ── State ─────────────────────────────────────────────

const milkPrice = ref(0)

const litresLoading = ref(true)
const litresPerCow = ref([])

const milkLoading = ref(true)
const milkTrends = ref([])

const costLoading = ref(true)
const treatmentCosts = ref({ months: [], grand_total: 0 })

const wastedLoading = ref(true)
const wastedMilk = ref({ months: [], total_discarded: 0 })

const producersLoading = ref(true)
const topProducers = ref([])

const bottomLoading = ref(true)
const bottomProducers = ref([])

const herdSize = ref(1)

// ── Chart data ────────────────────────────────────────

const litresPerCowChart = computed(() => ({
  labels: litresPerCow.value.map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: t('analytics.financial.litresPerCow', sp.value),
      data: litresPerCow.value.map((m) => m.avg_litres_per_cow_per_day),
      borderColor: chartColors.primary,
      backgroundColor: chartColors.primaryLight,
      fill: true,
      tension: 0.3,
    },
  ],
}))

const revenueChart = computed(() => ({
  labels: milkTrends.value.map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: t('analytics.financial.revenue'),
      data: milkTrends.value.map((m) => Math.round(m.total_litres * milkPrice.value)),
      backgroundColor: chartColors.primary,
      borderRadius: 4,
    },
  ],
}))

const costPerCowChart = computed(() => ({
  labels: (treatmentCosts.value.months || []).map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: t('analytics.financial.treatmentCostPerCow', sp.value),
      data: (treatmentCosts.value.months || []).map(
        (m) => Math.round((m.total_cost / Math.max(herdSize.value, 1)) * 100) / 100
      ),
      backgroundColor: chartColors.warning,
      borderRadius: 4,
    },
  ],
}))

const wastedChart = computed(() => ({
  labels: (wastedMilk.value.months || []).map((m) => formatMonth(m.month)),
  datasets: [
    {
      label: milkPrice.value > 0 ? 'R' : t('analytics.discardedLitres'),
      data: (wastedMilk.value.months || []).map((m) =>
        milkPrice.value > 0 ? Math.round(m.discarded_litres * milkPrice.value) : m.discarded_litres
      ),
      backgroundColor: chartColors.danger,
      borderRadius: 4,
    },
  ],
}))

const topChart = computed(() => ({
  labels: topProducers.value.map((c) => c.tag_number),
  datasets: [
    {
      label: t('analytics.avgDaily'),
      data: topProducers.value.map((c) => c.avg_daily_litres),
      backgroundColor: chartColors.primary,
      borderRadius: 4,
    },
  ],
}))

const bottomChart = computed(() => ({
  labels: bottomProducers.value.map((c) => c.tag_number),
  datasets: [
    {
      label: t('analytics.avgDaily'),
      data: bottomProducers.value.map((c) => c.avg_daily_litres),
      backgroundColor: chartColors.danger,
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

  if (flags.value.milkRecording) {
    litresLoading.value = true
    milkLoading.value = true
    producersLoading.value = true
    bottomLoading.value = true

    api
      .get(`/analytics/litres-per-cow${params}`)
      .then((r) => {
        litresPerCow.value = r.data.months || []
      })
      .catch(handleError)
      .finally(() => {
        litresLoading.value = false
      })

    api
      .get(`/analytics/milk-trends${params}`)
      .then((r) => {
        milkTrends.value = r.data.months || []
      })
      .catch(handleError)
      .finally(() => {
        milkLoading.value = false
      })

    api
      .get(`/analytics/top-producers${params}`)
      .then((r) => {
        topProducers.value = r.data || []
      })
      .catch(handleError)
      .finally(() => {
        producersLoading.value = false
      })

    api
      .get(`/analytics/bottom-producers${params}`)
      .then((r) => {
        bottomProducers.value = r.data || []
      })
      .catch(handleError)
      .finally(() => {
        bottomLoading.value = false
      })
  } else {
    litresLoading.value = false
    milkLoading.value = false
    producersLoading.value = false
    bottomLoading.value = false
  }

  if (flags.value.milkRecording && flags.value.treatments) {
    wastedLoading.value = true
    api
      .get(`/analytics/wasted-milk${params}`)
      .then((r) => {
        wastedMilk.value = r.data || { months: [], total_discarded: 0 }
      })
      .catch(handleError)
      .finally(() => {
        wastedLoading.value = false
      })
  } else {
    wastedLoading.value = false
  }

  if (flags.value.treatments) {
    costLoading.value = true
    api
      .get(`/analytics/treatment-costs${params}`)
      .then((r) => {
        treatmentCosts.value = r.data || { months: [], grand_total: 0 }
      })
      .catch(handleError)
      .finally(() => {
        costLoading.value = false
      })
  } else {
    costLoading.value = false
  }
}

onMounted(() => {
  // Snapshot endpoints — fetch once, not affected by time range
  api
    .get('/settings')
    .then((r) => {
      milkPrice.value = parseFloat(r.data.milk_price_per_litre) || 0
    })
    .catch(() => {
      /* ignore */
    })

  api
    .get('/analytics/herd-summary')
    .then((r) => {
      herdSize.value = r.data.total || 1
    })
    .catch(handleError)

  // Time-sensitive endpoints — initial load
  loadData()
})

watch(selectedRange, loadData)
</script>
