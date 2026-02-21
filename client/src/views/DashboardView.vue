<template>
  <div class="page">
    <AppHeader :title="t('dashboard.title')" :show-settings="authStore.isAdmin" />

    <div class="page-content">
      <!-- Greeting -->
      <div class="greeting">
        <p class="greeting-text">{{ t('dashboard.greeting') }}, <strong>{{ authStore.user?.full_name || authStore.user?.username }}</strong> 👋</p>
      </div>

      <!-- Herd Summary -->
      <section class="section">
        <h2 class="section-label">{{ t('dashboard.herdSummary') }}</h2>
        <div v-if="!summaryLoading" class="stats-grid">
          <div class="stat-card stat-active">
            <div class="stat-count">{{ summary.active ?? '—' }}</div>
            <div class="stat-label">{{ t('dashboard.active') }}</div>
          </div>
          <div class="stat-card stat-dry">
            <div class="stat-count">{{ summary.dry ?? '—' }}</div>
            <div class="stat-label">{{ t('dashboard.dry') }}</div>
          </div>
          <div class="stat-card stat-pregnant">
            <div class="stat-count">{{ summary.pregnant ?? '—' }}</div>
            <div class="stat-label">{{ t('dashboard.pregnant') }}</div>
          </div>
          <div class="stat-card stat-sick">
            <div class="stat-count">{{ summary.sick ?? '—' }}</div>
            <div class="stat-label">{{ t('dashboard.sick') }}</div>
          </div>
        </div>
        <div v-else class="stats-loading">
          <div class="spinner" />
        </div>
      </section>

      <!-- Quick Actions -->
      <section class="section">
        <h2 class="section-label">{{ t('dashboard.quickActions') }}</h2>
        <div class="actions-grid">
          <RouterLink to="/cows" class="action-card active-action">
            <span class="action-icon">🐄</span>
            <span class="action-label">{{ t('dashboard.viewCows') }}</span>
          </RouterLink>

          <RouterLink to="/analytics" class="action-card active-action">
            <span class="action-icon">📊</span>
            <span class="action-label">{{ t('dashboard.analytics') }}</span>
          </RouterLink>

          <RouterLink to="/log/treatment" class="action-card active-action">
            <span class="action-icon">💉</span>
            <span class="action-label">{{ t('dashboard.addLog') }}</span>
          </RouterLink>

          <RouterLink to="/log/issue" class="action-card active-action">
            <span class="action-icon">🩺</span>
            <span class="action-label">{{ t('dashboard.logIssue') }}</span>
          </RouterLink>

          <RouterLink to="/health-issues" class="action-card issues-action">
            <span class="action-icon">🚨</span>
            <span class="action-label">{{ t('dashboard.openIssues') }}</span>
          </RouterLink>

          <RouterLink to="/withdrawal" class="action-card withdrawal-action">
            <span class="action-icon">🚫</span>
            <span class="action-label">{{ t('dashboard.withdrawal') }}</span>
          </RouterLink>

          <div class="action-card disabled-action">
            <span class="action-icon">🥛</span>
            <span class="action-label">{{ t('dashboard.recordMilk') }}</span>
            <span class="action-badge">{{ t('dashboard.comingSoon') }}</span>
          </div>

          <div class="action-card disabled-action">
            <span class="action-icon">🐂</span>
            <span class="action-label">{{ t('dashboard.breed') }}</span>
            <span class="action-badge">{{ t('dashboard.comingSoon') }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth.js'
import api from '../services/api.js'
import AppHeader from '../components/organisms/AppHeader.vue'

const { t } = useI18n()
const authStore = useAuthStore()

const summary = ref({ active: null, dry: null, pregnant: null, sick: null })
const summaryLoading = ref(true)

onMounted(async () => {
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

/* Stats */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stats-loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.stat-card {
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border: 1px solid transparent;
}

.stat-count {
  font-family: var(--font-mono);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
}

.stat-label {
  font-size: 0.8125rem;
  font-weight: 600;
  opacity: 0.8;
}

.stat-active { background: var(--success-light); color: var(--primary-dark); border-color: rgba(45,106,79,0.2); }
.stat-dry { background: #FFF8E7; color: #92400E; border-color: rgba(180,83,9,0.15); }
.stat-pregnant { background: #EDE9FE; color: #5B21B6; border-color: rgba(109,40,217,0.15); }
.stat-sick { background: var(--danger-light); color: var(--danger); border-color: rgba(214,40,40,0.15); }

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
  gap: 8px;
  position: relative;
  box-shadow: var(--shadow-card);
  text-decoration: none;
  aspect-ratio: 1;
  text-align: center;
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

  .action-badge {
    font-size: 0.6875rem;
  }
}

.active-action {
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
  color: var(--text);
}

.active-action:active {
  transform: scale(0.97);
  box-shadow: none;
}

.disabled-action {
  opacity: 0.6;
  cursor: default;
}

.action-icon {
  font-size: 2rem;
  line-height: 1;
}

.action-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
}

.action-badge {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: var(--warning-light);
  color: var(--warning);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid rgba(224,124,36,0.2);
  white-space: nowrap;
}

.withdrawal-action {
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
  color: var(--text);
  background: #fce4e4;
  border-color: #ef9a9a;
}

.withdrawal-action:active {
  transform: scale(0.97);
  box-shadow: none;
}

.issues-action {
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s;
  color: var(--text);
  background: #fff8e1;
  border-color: #ffe082;
}

.issues-action:active {
  transform: scale(0.97);
  box-shadow: none;
}
</style>
