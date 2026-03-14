<template>
  <div class="page">
    <AppHeader :title="t('dashboard.title')" show-avatar />

    <div class="page-content">
      <!-- Greeting -->
      <div class="greeting">
        <p class="greeting-text">{{ t('dashboard.greeting') }}, <strong>{{ authStore.user?.full_name || authStore.user?.username }}</strong> 👋</p>
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
          </div>
        </section>
      </template>

      <!-- Normal farm dashboard -->
      <template v-else>

      <!-- Herd Summary -->
      <div v-if="!summaryLoading" data-tour="dashboard-stats" class="stats-row">
        <div class="stat-chip stat-active">
          <span class="stat-count">{{ summary.active ?? '—' }}</span>
          <span class="stat-label">{{ t('dashboard.active') }}</span>
        </div>
        <div class="stat-chip stat-dry">
          <span class="stat-count">{{ summary.dry ?? '—' }}</span>
          <span class="stat-label">{{ t('dashboard.dry') }}</span>
        </div>
        <div class="stat-chip stat-pregnant">
          <span class="stat-count">{{ summary.pregnant ?? '—' }}</span>
          <span class="stat-label">{{ t('dashboard.pregnant') }}</span>
        </div>
        <div class="stat-chip stat-sick">
          <span class="stat-count">{{ summary.sick ?? '—' }}</span>
          <span class="stat-label">{{ t('dashboard.sick') }}</span>
        </div>
      </div>

      <!-- Quick Actions -->
      <section class="section">
        <h2 class="section-label">{{ t('dashboard.quickActions') }}</h2>
        <div data-tour="dashboard-actions" class="actions-grid">
          <RouterLink to="/cows" class="action-card active-action">
            <span class="action-icon">🐄</span>
            <span class="action-label">{{ t('dashboard.viewCows') }}</span>
          </RouterLink>

          <RouterLink v-if="flags.analytics && hasPermission('can_view_analytics')" to="/analytics" class="action-card active-action">
            <span class="action-icon">📊</span>
            <span class="action-label">{{ t('dashboard.analytics') }}</span>
          </RouterLink>

          <RouterLink v-if="flags.treatments && hasPermission('can_log_treatments')" to="/log/treatment" class="action-card active-action">
            <span class="action-icon">💉</span>
            <span class="action-label">{{ t('dashboard.addLog') }}</span>
          </RouterLink>

          <RouterLink v-if="flags.healthIssues && hasPermission('can_log_issues')" to="/log/issue" class="action-card active-action">
            <span class="action-icon">🩺</span>
            <span class="action-label">{{ t('dashboard.logIssue') }}</span>
          </RouterLink>

          <RouterLink v-if="flags.healthIssues && hasPermission('can_log_issues')" to="/health-issues" class="action-card issues-action">
            <span class="action-icon">🚨</span>
            <span class="action-label">{{ t('dashboard.openIssues') }}</span>
          </RouterLink>

          <RouterLink v-if="flags.treatments && hasPermission('can_log_treatments')" to="/withdrawal" class="action-card withdrawal-action">
            <span class="action-icon">🚫</span>
            <span class="action-label">{{ t('dashboard.withdrawal') }}</span>
          </RouterLink>

          <RouterLink v-if="flags.milkRecording && hasPermission('can_record_milk')" to="/milk" class="action-card">
            <span class="action-icon">🥛</span>
            <span class="action-label">{{ t('dashboard.recordMilk') }}</span>
          </RouterLink>

          <RouterLink v-if="flags.breeding && hasPermission('can_log_breeding')" to="/breed" class="action-card active-action">
            <span class="action-icon">🐂</span>
            <span class="action-label">{{ t('dashboard.breed') }}</span>
          </RouterLink>
        </div>
      </section>

      </template><!-- end normal farm dashboard -->
    </div>

    <TourButton v-if="hasFarmContext" @start-tour="startTour" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth.js'
import { useFeatureFlagsStore } from '../stores/featureFlags.js'
import api from '../services/api.js'
import AppHeader from '../components/organisms/AppHeader.vue'
import TourButton from '../components/atoms/TourButton.vue'
import { useTour } from '../composables/useTour.js'

const { t } = useI18n()
const authStore = useAuthStore()
const featureFlagsStore = useFeatureFlagsStore()

const flags = computed(() => featureFlagsStore.flags)
const { hasPermission } = authStore
const hasFarmContext = computed(() => !!authStore.user?.farm_id)

const { startTour } = useTour('dashboard', () => [
  {
    popover: {
      title: t('tour.dashboard.welcome.title'),
      description: t('tour.dashboard.welcome.desc'),
    }
  },
  {
    element: '[data-tour="dashboard-stats"]',
    popover: {
      title: t('tour.dashboard.stats.title'),
      description: t('tour.dashboard.stats.desc'),
    }
  },
  {
    element: '[data-tour="dashboard-actions"]',
    popover: {
      title: t('tour.dashboard.quickActions.title'),
      description: t('tour.dashboard.quickActions.desc'),
    }
  },
  {
    element: '.bottom-nav',
    popover: {
      title: t('tour.dashboard.nav.title'),
      description: t('tour.dashboard.nav.desc'),
    }
  },
])

const summary = ref({ active: null, dry: null, pregnant: null, sick: null })
const summaryLoading = ref(true)
const systemStats = ref(null)

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

  if (!hasFarmContext.value || !hasPermission('can_view_analytics')) {
    summaryLoading.value = false
    return
  }
  try {
    const r = await api.get('/analytics/herd-summary')
    // API returns { total, by_status: [{status, count}] }
    const rows = r.data.by_status || []
    rows.forEach(item => {
      if (item.status in summary.value) summary.value[item.status] = item.count
    })
  } catch {
    // silent fail — offline or error
  } finally {
    summaryLoading.value = false
  }
})
</script>

<style scoped>
.greeting {
  margin-bottom: 20px;
}

.greeting-text {
  font-size: 1.0625rem;
  color: var(--text-secondary);
}

.greeting-text strong {
  color: var(--text);
  font-weight: 700;
}

.section {
  margin-bottom: 24px;
}

.section-label {
  margin-bottom: 12px;
  display: block;
}

/* Stats row */
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

.stat-active { background: var(--success-light); color: var(--primary-dark); border-color: rgba(45,106,79,0.2); }
.stat-dry { background: #FFF8E7; color: #78350F; border-color: rgba(180,83,9,0.15); }
.stat-pregnant { background: #EDE9FE; color: #4C1D95; border-color: rgba(109,40,217,0.15); }
.stat-sick { background: var(--danger-light); color: var(--danger); border-color: rgba(214,40,40,0.15); }
.stat-total { background: #EEF2FF; color: #3730A3; border-color: rgba(67,56,202,0.15); }
.stat-milking { background: #E0F2FE; color: #075985; border-color: rgba(3,105,161,0.15); }

/* Actions */
.actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.action-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  position: relative;
  box-shadow: var(--shadow-card);
  text-decoration: none;
  aspect-ratio: 4 / 3;
  text-align: center;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.15s, border-color 0.15s;
  color: var(--text);
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

@media (min-width: 600px) {
  .action-card {
    padding: 20px 16px;
    align-items: flex-start;
    justify-content: flex-start;
    text-align: left;
    aspect-ratio: unset;
  }

  .action-icon {
    font-size: 1.75rem;
  }

  .action-label {
    font-size: 0.9375rem;
  }
}

.action-icon {
  font-size: 2rem;
  line-height: 1;
}

.action-label {
  font-size: clamp(0.7rem, 3.2vw, 0.875rem);
  font-weight: 600;
  color: var(--text);
  line-height: 1.25;
  overflow-wrap: break-word;
  max-width: 100%;
}

.withdrawal-action {
  background: #fce4e4;
  border-color: #ef9a9a;
}

.issues-action {
  background: #fff8e1;
  border-color: #ffe082;
}
</style>
