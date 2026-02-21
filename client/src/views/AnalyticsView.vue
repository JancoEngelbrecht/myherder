<template>
  <div class="page">
    <AppHeader :title="t('analytics.title')" />

    <div class="page-content">
      <!-- Herd Status breakdown -->
      <section class="section">
        <h2 class="section-label">{{ t('analytics.herdStatus') }}</h2>

        <div v-if="loading" class="center-spinner"><div class="spinner" /></div>

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

      <!-- Health Alerts -->
      <section class="section">
        <h2 class="section-label">{{ t('analytics.unhealthiest') }}</h2>
        <div v-if="healthLoading" class="center-spinner"><div class="spinner" /></div>
        <div v-else-if="unhealthiest.length === 0" class="empty-health">
          <span class="empty-icon">✅</span>
          <span class="empty-text">{{ t('analytics.noAlerts') }}</span>
        </div>
        <div v-else class="health-list">
          <RouterLink
            v-for="cow in unhealthiest"
            :key="cow.id"
            :to="`/cows/${cow.id}`"
            class="health-item"
          >
            <span>{{ cow.sex === 'male' ? '🐂' : '🐄' }}</span>
            <span class="mono health-tag">{{ cow.tag_number }}</span>
            <span class="health-name">{{ cow.name || '—' }}</span>
            <span class="health-count mono">{{ cow.issue_count }}</span>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import api from '../services/api.js'
import AppHeader from '../components/organisms/AppHeader.vue'

const { t } = useI18n()

const rawData = ref([])
const loading = ref(true)
const unhealthiest = ref([])
const healthLoading = ref(true)

const statusBreakdown = computed(() => {
  const allStatuses = ['active', 'dry', 'pregnant', 'sick', 'sold', 'dead']
  return allStatuses.map(status => {
    const found = rawData.value.find(d => d.status === status)
    return { status, count: found ? found.count : 0 }
  })
})

const maxCount = computed(() => Math.max(...statusBreakdown.value.map(d => d.count), 1))

function barWidth(count) {
  return `${Math.max(4, (count / maxCount.value) * 100)}%`
}

onMounted(() => {
  api.get('/analytics/herd-summary')
    .then(r => { rawData.value = r.data.by_status || [] })
    .catch(() => { rawData.value = [] })
    .finally(() => { loading.value = false })

  api.get('/analytics/unhealthiest')
    .then(r => { unhealthiest.value = r.data || [] })
    .catch(() => { unhealthiest.value = [] })
    .finally(() => { healthLoading.value = false })
})
</script>

<style scoped>
.section {
  margin-bottom: 24px;
}

.section-label {
  display: block;
  margin-bottom: 12px;
}

.center-spinner {
  display: flex;
  justify-content: center;
  padding: 32px;
}

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

/* Health alerts */
.empty-health {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--success-light);
  border-radius: var(--radius);
}

.empty-icon {
  font-size: 1.25rem;
}

.empty-text {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--primary-dark);
}

.health-list {
  display: flex;
  flex-direction: column;
}

.health-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
  font-size: 0.9375rem;
}

.health-item:last-child {
  border-bottom: none;
}

.health-tag {
  font-size: 0.8125rem;
  color: var(--primary);
  font-weight: 600;
}

.health-name {
  flex: 1;
  font-weight: 500;
}

.health-count {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--danger);
  background: var(--danger-light);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}
</style>
