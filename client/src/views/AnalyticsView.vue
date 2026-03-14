<template>
  <div class="page">
    <AppHeader :title="t('analytics.title')" show-back back-to="/" />

    <div class="page-content">
      <!-- Offline banner -->
      <div v-if="offline" class="offline-banner">
        <span>📡</span>
        <span>{{ t('analytics.connectToView') }}</span>
      </div>

      <template v-if="!offline">
        <!-- Daily KPI cards -->
        <section data-tour="analytics-kpis" class="kpi-section">
          <h2 class="analytics-title">{{ t('analytics.landing.todaySnapshot') }}</h2>

          <div v-if="loading" class="center-spinner"><div class="spinner" /></div>

          <div v-else class="kpi-grid">
            <!-- Total Herd -->
            <div class="kpi-card">
              <div class="kpi-value mono">{{ totalHerd }}</div>
              <div class="kpi-label">{{ t('analytics.landing.totalHerd') }}</div>
            </div>

            <!-- Litres Today -->
            <div v-if="flags.milkRecording" class="kpi-card">
              <div class="kpi-value mono">{{ kpis.litres_today }}</div>
              <div class="kpi-label">{{ t('analytics.landing.litresToday') }}</div>
              <div class="kpi-compare mono" :class="litresTrendPct >= 0 ? 'trend-up' : 'trend-down'">
                {{ litresTrendPct >= 0 ? '▲' : '▼' }} {{ Math.abs(litresTrendPct) }}% {{ t('analytics.landing.vs7dayAvg') }}
              </div>
            </div>

            <!-- Cows Milked -->
            <div v-if="flags.milkRecording" class="kpi-card">
              <div class="kpi-value mono">{{ kpis.cows_milked_today }}</div>
              <div class="kpi-label">{{ t('analytics.landing.cowsMilked') }}</div>
              <div class="kpi-compare mono" :class="kpis.cows_milked_today >= kpis.cows_expected ? 'trend-up' : 'trend-down'">
                {{ t('analytics.landing.ofExpected', { expected: kpis.cows_expected }) }}
              </div>
            </div>

            <!-- Active Health Issues -->
            <div v-if="flags.healthIssues" class="kpi-card">
              <div class="kpi-value mono" :class="kpis.active_health_issues > 0 ? 'value-warn' : ''">
                {{ kpis.active_health_issues }}
              </div>
              <div class="kpi-label">{{ t('analytics.landing.activeIssues') }}</div>
            </div>

            <!-- Breeding Due -->
            <div v-if="flags.breeding" class="kpi-card">
              <div class="kpi-value mono" :class="kpis.breeding_actions_due > 0 ? 'value-info' : ''">
                {{ kpis.breeding_actions_due }}
              </div>
              <div class="kpi-label">{{ t('analytics.landing.breedingDue') }}</div>
            </div>
          </div>
        </section>

        <!-- Herd Status breakdown -->
        <section class="analytics-card">
          <h2 class="analytics-title">{{ t('analytics.herdStatus') }}</h2>

          <div v-if="statusLoading" class="center-spinner"><div class="spinner" /></div>

          <div v-else class="status-list">
            <div
              v-for="item in statusBreakdown"
              :key="item.status"
              class="status-row"
            >
              <div class="status-info">
                <span class="badge" :class="`badge-${item.status}`">
                  {{ t(`status.${item.status}`) }}
                </span>
              </div>
              <div class="status-bar-wrap">
                <div
                  class="status-bar"
                  :class="`bar-${item.status}`"
                  :style="{ width: barWidth(item.count) }"
                />
              </div>
              <div class="status-count mono">{{ item.count }}</div>
            </div>
          </div>
        </section>

        <!-- Category navigation -->
        <section data-tour="analytics-categories" class="categories-section">
          <h2 class="analytics-title">{{ t('analytics.categories.title') }}</h2>

          <div class="categories-grid">
            <RouterLink
              v-if="flags.milkRecording || flags.treatments"
              to="/analytics/financial"
              class="category-card"
            >
              <div class="category-icon-wrap category-icon-financial">📈</div>
              <div class="category-text">
                <div class="category-name">{{ t('analytics.categories.financial') }}</div>
                <div class="category-desc">{{ t('analytics.categories.financialDesc') }}</div>
              </div>
              <div class="category-arrow">›</div>
            </RouterLink>

            <RouterLink
              v-if="flags.breeding"
              to="/analytics/fertility"
              class="category-card"
            >
              <div class="category-icon-wrap category-icon-fertility">🐄</div>
              <div class="category-text">
                <div class="category-name">{{ t('analytics.categories.fertility') }}</div>
                <div class="category-desc">{{ t('analytics.categories.fertilityDesc') }}</div>
              </div>
              <div class="category-arrow">›</div>
            </RouterLink>

            <RouterLink
              v-if="flags.healthIssues || flags.treatments"
              to="/analytics/health"
              class="category-card"
            >
              <div class="category-icon-wrap category-icon-health">🩺</div>
              <div class="category-text">
                <div class="category-name">{{ t('analytics.categories.health') }}</div>
                <div class="category-desc">{{ t('analytics.categories.healthDesc') }}</div>
              </div>
              <div class="category-arrow">›</div>
            </RouterLink>

            <RouterLink to="/analytics/structure" class="category-card">
              <div class="category-icon-wrap category-icon-structure">🥧</div>
              <div class="category-text">
                <div class="category-name">{{ t('analytics.categories.structure') }}</div>
                <div class="category-desc">{{ t('analytics.categories.structureDesc') }}</div>
              </div>
              <div class="category-arrow">›</div>
            </RouterLink>
          </div>
        </section>
      </template>
    </div>

    <TourButton v-if="!offline" @start-tour="startTour" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../services/api.js'
import AppHeader from '../components/organisms/AppHeader.vue'
import TourButton from '../components/atoms/TourButton.vue'
import { useAnalytics } from '../composables/useAnalytics.js'
import { useTour } from '../composables/useTour.js'
import '../assets/analytics.css'

const { offline, flags, handleError, t } = useAnalytics()

const { startTour } = useTour('analytics', () => [
  {
    element: '[data-tour="analytics-kpis"]',
    popover: {
      title: t('tour.analytics.kpis.title'),
      description: t('tour.analytics.kpis.desc'),
    }
  },
  {
    element: '[data-tour="analytics-categories"]',
    popover: {
      title: t('tour.analytics.categories.title'),
      description: t('tour.analytics.categories.desc'),
    }
  },
])

// ── State ─────────────────────────────────────────────

const loading = ref(true)
const statusLoading = ref(true)

const kpis = ref({
  litres_today: 0,
  litres_7day_avg: 0,
  cows_milked_today: 0,
  cows_expected: 0,
  active_health_issues: 0,
  breeding_actions_due: 0,
})

const totalHerd = ref(0)
const rawStatus = ref([])

// ── Computed ──────────────────────────────────────────

const litresTrendPct = computed(() => {
  const avg = kpis.value.litres_7day_avg
  if (avg === 0) return 0
  return Math.round(((kpis.value.litres_today - avg) / avg) * 100)
})


const statusBreakdown = computed(() => {
  const allStatuses = ['active', 'dry', 'pregnant', 'sick', 'sold', 'dead']
  return allStatuses.map(status => {
    const found = rawStatus.value.find(d => d.status === status)
    return { status, count: found ? found.count : 0 }
  })
})

const maxCount = computed(() => Math.max(...statusBreakdown.value.map(d => d.count), 1))

// ── Helpers ───────────────────────────────────────────

function barWidth(count) {
  return `${Math.max(4, (count / maxCount.value) * 100)}%`
}

// ── Fetch data ────────────────────────────────────────

onMounted(() => {
  api.get('/analytics/daily-kpis')
    .then(r => { kpis.value = r.data })
    .catch(handleError)
    .finally(() => { loading.value = false })

  api.get('/analytics/herd-summary')
    .then(r => {
      rawStatus.value = r.data.by_status || []
      totalHerd.value = r.data.total || 0
    })
    .catch(handleError)
    .finally(() => { statusLoading.value = false })
})
</script>

<style scoped>
/* Daily KPIs */
.kpi-section {
  margin-bottom: 16px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.kpi-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 14px 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: var(--shadow-card);
}

.kpi-value {
  display: block;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--primary);
  line-height: 1.2;
}

.kpi-value.value-warn {
  color: var(--danger);
}

.kpi-value.value-info {
  color: var(--info, #3A86FF);
}

.kpi-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 4px;
  text-align: center;
}

.kpi-compare {
  display: block;
  font-size: 0.6875rem;
  margin-top: 4px;
}

.trend-up {
  color: var(--primary);
}

.trend-down {
  color: var(--danger);
}

/* Herd status bars */
.status-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-info {
  width: 90px;
  flex-shrink: 0;
}

.status-bar-wrap {
  flex: 1;
  height: 8px;
  background: var(--border);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.status-bar {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width 0.4s ease;
}

.bar-active { background: var(--primary); }
.bar-dry { background: #D97706; }
.bar-pregnant { background: #7C3AED; }
.bar-sick { background: var(--danger); }
.bar-sold { background: var(--text-muted); }
.bar-dead { background: #9CA3AF; }

.status-count {
  width: 28px;
  text-align: right;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text);
  flex-shrink: 0;
}

/* Category navigation */
.categories-section {
  margin-bottom: 16px;
}

.categories-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  text-decoration: none;
  color: var(--text);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.category-card:active {
  transform: scale(0.98);
}

.category-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.375rem;
  flex-shrink: 0;
}

.category-icon-financial { background: #E8F5E9; }
.category-icon-fertility { background: #EDE7F6; }
.category-icon-health { background: #E3F2FD; }
.category-icon-structure { background: #FFF3E0; }

.category-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.category-name {
  display: block;
  font-weight: 700;
  font-size: 0.9375rem;
}

.category-desc {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-arrow {
  font-size: 1.5rem;
  color: var(--text-muted);
  flex-shrink: 0;
  font-weight: 300;
}
</style>
