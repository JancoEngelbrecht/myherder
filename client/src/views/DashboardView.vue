<template>
  <div class="page">
    <AppHeader :title="t('dashboard.title')" show-avatar />

    <div class="page-content">
      <!-- Greeting -->
      <div class="greeting">
        <p class="greeting-text">
          {{ t('dashboard.greeting') }},
          <strong>{{ authStore.user?.full_name || authStore.user?.username }}</strong>
        </p>
      </div>

      <!-- Super-admin without farm context -->
      <template v-if="authStore.isSuperAdmin && !hasFarmContext">
        <!-- System Stats -->
        <div v-if="systemStats" class="stats-row">
          <div class="stat-chip stat-active">
            <span class="stat-count">{{ systemStats.active_farms }}</span>
            <span class="stat-label">{{ t('globalDefaults.totalFarms') }}</span>
          </div>
          <div class="stat-chip stat-total">
            <span class="stat-count">{{ systemStats.active_users }}</span>
            <span class="stat-label">{{ t('globalDefaults.totalUsers') }}</span>
          </div>
          <div class="stat-chip stat-milking">
            <span class="stat-count">{{ systemStats.active_cows }}</span>
            <span class="stat-label">{{ t('globalDefaults.totalCows') }}</span>
          </div>
        </div>

        <section class="section">
          <h2 class="section-label">{{ t('superAdmin.management') }}</h2>
          <div class="actions-grid">
            <RouterLink to="/super/farms" class="action-card active-action">
              <span class="action-icon">🏢</span>
              <span class="action-label">{{ t('superAdmin.farms') }}</span>
            </RouterLink>
            <RouterLink to="/super/defaults" class="action-card active-action">
              <span class="action-icon">⚙️</span>
              <span class="action-label">{{ t('globalDefaults.title') }}</span>
            </RouterLink>
            <RouterLink to="/super/announcements" class="action-card active-action">
              <span class="action-icon">📢</span>
              <span class="action-label">{{ t('announcements.title') }}</span>
            </RouterLink>
            <RouterLink to="/super/system-health" class="action-card active-action">
              <span class="action-icon">🩺</span>
              <span class="action-label">{{ t('systemHealth.title') }}</span>
            </RouterLink>
            <RouterLink to="/super/farm-groups" class="action-card active-action">
              <span class="action-icon">🔗</span>
              <span class="action-label">{{ t('farmGroups.title') }}</span>
            </RouterLink>
          </div>
        </section>
      </template>

      <!-- Normal farm dashboard -->
      <template v-else>
        <!-- Section header: Main Actions -->
        <h2 class="section-label">{{ t('dashboard.mainActions').toUpperCase() }}</h2>

        <!-- Herd card -->
        <RouterLink
          to="/cows"
          class="herd-card"
          data-tour="dashboard-herd"
          :data-herd-total="herdTotal"
          :data-herd-pregnant="herdPregnant"
        >
          <div class="herd-avatar">
            <span class="herd-emoji">{{ speciesEmoji.female }}</span>
          </div>
          <div class="herd-info">
            <span class="herd-title">{{ t('dashboard.viewAnimals', { collectiveNoun }) }}</span>
            <span v-if="!summaryLoading" class="herd-subtitle">
              {{
                t('dashboard.herdSubtitle', {
                  total: herdTotal ?? '—',
                  collectiveNoun,
                  pregnant: herdPregnant ?? '—',
                  pregnantLabel: t('dashboard.pregnant').toLowerCase(),
                })
              }}
            </span>
            <span v-else class="herd-subtitle">—</span>
          </div>
          <span class="herd-chevron">›</span>
        </RouterLink>

        <!-- Breeding + Health row -->
        <div
          v-if="
            (flags.breeding && hasPermission('can_log_breeding')) ||
            (flags.healthIssues && hasPermission('can_log_issues'))
          "
          class="action-pair"
          data-tour="dashboard-actions"
        >
          <RouterLink
            v-if="flags.breeding && hasPermission('can_log_breeding')"
            to="/breed"
            class="action-card"
          >
            <div class="icon-circle icon-circle--purple">
              <span>{{ speciesEmoji.male }}</span>
            </div>
            <span class="action-title">{{ t('dashboard.breed') }}</span>
            <span class="action-subtitle">{{ t('dashboard.breedSubtitle') }}</span>
          </RouterLink>

          <RouterLink
            v-if="flags.healthIssues && hasPermission('can_log_issues')"
            to="/log/issue"
            class="action-card"
          >
            <div class="icon-circle icon-circle--green">
              <span>🩺</span>
            </div>
            <span class="action-title">{{ t('dashboard.health') }}</span>
            <span class="action-subtitle">{{ t('dashboard.logIssue') }}</span>
          </RouterLink>
        </div>

        <!-- Treatment + Milk row -->
        <div
          v-if="
            (flags.treatments && hasPermission('can_log_treatments')) ||
            (flags.milkRecording && hasPermission('can_record_milk'))
          "
          class="action-pair"
        >
          <RouterLink
            v-if="flags.treatments && hasPermission('can_log_treatments')"
            to="/log/treatment"
            class="action-card"
          >
            <div class="icon-circle icon-circle--teal">
              <span>💉</span>
            </div>
            <span class="action-title">{{ t('dashboard.addLog') }}</span>
            <span class="action-subtitle">{{ t('dashboard.health') }}</span>
          </RouterLink>

          <RouterLink
            v-if="flags.milkRecording && hasPermission('can_record_milk')"
            to="/milk"
            class="action-card"
          >
            <div class="icon-circle icon-circle--blue">
              <span>🥛</span>
            </div>
            <span class="action-title">{{ t('dashboard.recordMilk') }}</span>
            <span class="action-subtitle">{{ t('dashboard.milkSubtitle') }}</span>
          </RouterLink>
        </div>

        <!-- Section header: More Options -->
        <template
          v-if="
            (flags.analytics && hasPermission('can_view_analytics')) ||
            (flags.healthIssues && hasPermission('can_log_issues')) ||
            (flags.treatments && hasPermission('can_log_treatments'))
          "
        >
          <h2 class="section-label section-label--spaced">
            {{ t('dashboard.moreOptions').toUpperCase() }}
          </h2>

          <!-- More options row -->
          <div class="more-options">
            <RouterLink
              v-if="flags.healthIssues && hasPermission('can_log_issues')"
              to="/health-issues"
              class="option-btn"
              :data-issue-count="openIssueCount"
            >
              <div class="option-circle option-circle--red">
                <span>🚨</span>
              </div>
              <span class="option-label">{{ t('dashboard.openIssues') }}</span>
              <span class="option-count">{{ openIssueCount }}</span>
            </RouterLink>

            <RouterLink
              v-if="flags.treatments && hasPermission('can_log_treatments')"
              to="/withdrawal"
              class="option-btn"
              :data-withdrawal-count="withdrawalCount"
            >
              <div class="option-circle option-circle--orange">
                <span>🚫</span>
              </div>
              <span class="option-label">{{ t('dashboard.withdrawal') }}</span>
              <span class="option-count">{{ withdrawalCount }}</span>
            </RouterLink>

            <RouterLink
              v-if="flags.analytics && hasPermission('can_view_analytics')"
              to="/analytics"
              class="option-btn"
            >
              <div class="option-circle option-circle--indigo">
                <span>📊</span>
              </div>
              <span class="option-label">{{ t('dashboard.analytics') }}</span>
            </RouterLink>
          </div>
        </template>
      </template>
      <!-- end normal farm dashboard -->
    </div>

    <TourButton v-if="hasFarmContext" @start-tour="startTour" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { useFeatureFlagsStore } from '../stores/featureFlags'
import { useSpeciesTerms } from '../composables/useSpeciesTerms'
import api from '../services/api'
import AppHeader from '../components/organisms/AppHeader.vue'
import TourButton from '../components/atoms/TourButton.vue'
import { useTour } from '../composables/useTour'

const { t } = useI18n()
const authStore = useAuthStore()
const featureFlagsStore = useFeatureFlagsStore()
const { emoji: speciesEmoji, collectiveNoun } = useSpeciesTerms()

const flags = computed(() => featureFlagsStore.flags)
const { hasPermission } = authStore
const hasFarmContext = computed(() => !!authStore.user?.farm_id)

const { startTour } = useTour('dashboard', () => [
  {
    popover: {
      title: t('tour.dashboard.welcome.title'),
      description: t('tour.dashboard.welcome.desc'),
    },
  },
  {
    element: '[data-tour="dashboard-herd"]',
    popover: {
      title: t('tour.dashboard.stats.title'),
      description: t('tour.dashboard.stats.desc'),
    },
  },
  {
    element: '[data-tour="dashboard-actions"]',
    popover: {
      title: t('tour.dashboard.quickActions.title'),
      description: t('tour.dashboard.quickActions.desc'),
    },
  },
  {
    element: '.bottom-nav',
    popover: {
      title: t('tour.dashboard.nav.title'),
      description: t('tour.dashboard.nav.desc'),
    },
  },
])

const summaryLoading = ref(true)
const systemStats = ref(null)
const herdTotal = ref(null)
const herdPregnant = ref(null)
const openIssueCount = ref(0)
const withdrawalCount = ref(0)

onMounted(async () => {
  // Super-admin stats (no farm context)
  if (authStore.isSuperAdmin && !hasFarmContext.value) {
    try {
      const { data } = await api.get('/farms/stats')
      systemStats.value = data
    } catch {
      // silent fail
    }
    summaryLoading.value = false
    return
  }

  if (!hasFarmContext.value) {
    summaryLoading.value = false
    return
  }

  const canViewAnalytics = hasPermission('can_view_analytics')
  const canLogIssues = hasPermission('can_log_issues')
  const canLogTreatments = hasPermission('can_log_treatments')

  const herdCall = canViewAnalytics ? api.get('/analytics/herd-summary') : Promise.resolve(null)

  const issuesCall =
    canLogIssues && flags.value.healthIssues
      ? api.get('/health-issues?status=open&page=1&limit=1')
      : Promise.resolve(null)

  const withdrawalCall =
    canLogTreatments && flags.value.treatments
      ? api.get('/treatments/withdrawal')
      : Promise.resolve(null)

  const [herdResult, issuesResult, withdrawalResult] = await Promise.allSettled([
    herdCall,
    issuesCall,
    withdrawalCall,
  ])

  // Herd summary
  if (herdResult.status === 'fulfilled' && herdResult.value) {
    const data = herdResult.value.data
    herdTotal.value = data.total ?? null
    const pregnantRow = (data.by_status || []).find((r) => r.status === 'pregnant')
    herdPregnant.value = pregnantRow ? pregnantRow.count : 0
  }

  // Open issues count (from X-Total-Count header)
  if (issuesResult.status === 'fulfilled' && issuesResult.value) {
    openIssueCount.value = parseInt(issuesResult.value.headers?.['x-total-count'], 10) || 0
  }

  // Withdrawal count
  if (withdrawalResult.status === 'fulfilled' && withdrawalResult.value) {
    withdrawalCount.value = Array.isArray(withdrawalResult.value.data)
      ? withdrawalResult.value.data.length
      : 0
  }

  summaryLoading.value = false
})
</script>

<style scoped>
/* ── Greeting ─────────────────────────────────────────────────────────── */
.greeting {
  margin-bottom: 20px;
}

.greeting-text {
  font-size: 1.5rem;
  color: var(--text-secondary);
  font-weight: 400;
  line-height: 1.3;
}

.greeting-text strong {
  color: var(--text);
  font-weight: 600;
}

/* ── Section labels ───────────────────────────────────────────────────── */
.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin-bottom: 12px;
  display: block;
}

.section-label--spaced {
  margin-top: 24px;
}

/* ── Herd card ────────────────────────────────────────────────────────── */
.herd-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  text-decoration: none;
  color: var(--text);
  margin-bottom: 12px;
  transition:
    transform 0.1s,
    box-shadow 0.15s,
    border-color 0.15s;
}

.herd-card:hover {
  box-shadow: var(--shadow);
  border-color: var(--primary-light);
}

.herd-card:active {
  transform: scale(0.98);
  box-shadow: none;
}

.herd-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(45, 106, 79, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 1.5rem;
}

.herd-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.herd-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.herd-subtitle {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.herd-chevron {
  font-size: 1.5rem;
  color: var(--text-secondary);
  line-height: 1;
  flex-shrink: 0;
}

/* ── Action pair (2-column grid) ──────────────────────────────────────── */
.action-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

/* ── Action card ──────────────────────────────────────────────────────── */
.action-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-decoration: none;
  color: var(--text);
  box-shadow: var(--shadow-card);
  transition:
    transform 0.1s,
    box-shadow 0.15s,
    border-color 0.15s;
}

.action-card:hover {
  box-shadow: var(--shadow);
  border-color: var(--primary-light);
}

.action-card:active {
  transform: scale(0.97);
  box-shadow: none;
}

.action-card:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* ── Icon circle ──────────────────────────────────────────────────────── */
.icon-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.125rem;
  flex-shrink: 0;
}

.icon-circle--blue {
  background: rgba(59, 130, 246, 0.12);
}

.icon-circle--purple {
  background: rgba(139, 92, 246, 0.12);
}

.action-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.25;
}

.action-subtitle {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.3;
}

/* ── More options ─────────────────────────────────────────────────────── */
.more-options {
  display: flex;
  justify-content: space-evenly;
  gap: 8px;
  margin-bottom: 24px;
}

.option-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--text);
  flex: 1;
  max-width: 96px;
}

.option-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  transition: transform 0.1s;
}

.option-btn:active .option-circle {
  transform: scale(0.93);
}

.option-circle--red {
  background: rgba(214, 40, 40, 0.12);
}

.option-circle--orange {
  background: rgba(224, 124, 36, 0.12);
}

.option-circle--indigo {
  background: rgba(99, 102, 241, 0.12);
}

.option-circle--teal {
  background: rgba(20, 184, 166, 0.12);
}

.option-circle--green {
  background: rgba(45, 106, 79, 0.12);
}

.option-label {
  font-size: 0.75rem;
  font-weight: 500;
  text-align: center;
  color: var(--text-secondary);
  line-height: 1.2;
}

.option-count {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-secondary);
}

/* ── Super-admin stats (unchanged) ───────────────────────────────────── */
.section {
  margin-bottom: 24px;
}

.stats-row {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}

.stat-chip {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: var(--radius);
  border: 1px solid transparent;
}

.stat-count {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
}

.stat-label {
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-active {
  background: var(--success-light);
  color: var(--primary-dark);
  border-color: rgba(4, 120, 87, 0.2);
}

.stat-total {
  background: #eef2ff;
  color: #3730a3;
  border-color: rgba(67, 56, 202, 0.15);
}

.stat-milking {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: rgba(29, 78, 216, 0.15);
}

/* ── Super-admin actions grid (unchanged) ─────────────────────────────── */
.actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.action-card.active-action {
  align-items: center;
  justify-content: center;
  text-align: center;
  aspect-ratio: 4 / 3;
  gap: 6px;
  padding: 16px 12px;
}

.action-icon {
  font-size: 2rem;
  line-height: 1;
}

.action-card.active-action .action-label {
  font-size: clamp(0.7rem, 3.2vw, 0.875rem);
  font-weight: 600;
  color: var(--text);
  line-height: 1.25;
}
</style>
