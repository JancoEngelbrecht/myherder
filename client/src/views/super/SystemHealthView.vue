<template>
  <div class="page">
    <AppHeader :title="t('systemHealth.title')" show-back back-to="/" show-avatar />

    <div class="page-content">
      <div v-if="loading" class="empty-state"><span class="spinner" /></div>

      <template v-else-if="health">
        <!-- Server Info -->
        <div class="card info-card">
          <h3 class="section-label">{{ t('systemHealth.serverInfo') }}</h3>
          <div class="info-row">
            <span class="info-label">Node.js</span>
            <span class="mono">{{ health.node_version }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">{{ t('systemHealth.uptime') }}</span>
            <span class="mono">{{ formatUptime(health.uptime_seconds) }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">{{ t('systemHealth.statsSince') }}</span>
            <span class="mono">{{ formatDate(health.requests.started_at) }}</span>
          </div>
        </div>

        <!-- Memory -->
        <div class="card metric-card">
          <div class="metric-header">
            <h3 class="section-label">{{ t('systemHealth.memory') }}</h3>
            <span :class="['status-dot', `status-${health.thresholds.memory_status}`]" />
          </div>
          <div class="metric-bars">
            <div class="bar-group">
              <div class="bar-label">
                <span>RSS</span>
                <span class="mono">{{ health.memory.rss_mb }} MB</span>
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :class="`bar-${health.thresholds.memory_status}`"
                  :style="{ width: Math.min((health.memory.rss_mb / 1024) * 100, 100) + '%' }"
                />
              </div>
            </div>
            <div class="bar-group">
              <div class="bar-label">
                <span>{{ t('systemHealth.heapUsed') }}</span>
                <span class="mono"
                  >{{ health.memory.heap_used_mb }} / {{ health.memory.heap_total_mb }} MB</span
                >
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :class="`bar-${heapStatus}`"
                  :style="{
                    width:
                      Math.min(
                        (health.memory.heap_used_mb / health.memory.heap_total_mb) * 100,
                        100
                      ) + '%',
                  }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Disk -->
        <div class="card metric-card">
          <div class="metric-header">
            <h3 class="section-label">{{ t('systemHealth.disk') }}</h3>
            <span :class="['status-dot', `status-${health.thresholds.disk_status}`]" />
          </div>
          <template v-if="health.disk">
            <div class="bar-group">
              <div class="bar-label">
                <span>{{ health.disk.used_gb }} / {{ health.disk.total_gb }} GB</span>
                <span class="mono">{{ health.disk.used_pct }}%</span>
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :class="`bar-${health.thresholds.disk_status}`"
                  :style="{ width: health.disk.used_pct + '%' }"
                />
              </div>
            </div>
          </template>
          <p v-else class="unavailable">{{ t('systemHealth.unavailable') }}</p>
        </div>

        <!-- Database -->
        <div class="card metric-card">
          <div class="metric-header">
            <h3 class="section-label">{{ t('systemHealth.database') }}</h3>
          </div>
          <template v-if="health.database">
            <div class="info-row">
              <span class="info-label">{{ t('systemHealth.totalSize') }}</span>
              <span class="mono">{{ health.database.size_mb }} MB</span>
            </div>
            <div v-if="health.database.tables.length" class="table-list">
              <div v-for="table in health.database.tables" :key="table.name" class="table-row">
                <span class="mono table-name">{{ table.name }}</span>
                <span class="table-stats">
                  <span class="mono"
                    >{{ table.rows.toLocaleString() }} {{ t('systemHealth.rows') }}</span
                  >
                  <span class="mono">{{ table.size_mb }} MB</span>
                </span>
              </div>
            </div>
          </template>
          <p v-else class="unavailable">{{ t('systemHealth.unavailable') }}</p>
        </div>

        <!-- Request Stats -->
        <div class="card metric-card">
          <div class="metric-header">
            <h3 class="section-label">{{ t('systemHealth.requests') }}</h3>
            <span :class="['status-dot', `status-${health.thresholds.response_status}`]" />
          </div>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-value mono">{{ health.requests.total.toLocaleString() }}</span>
              <span class="stat-desc">{{ t('systemHealth.totalRequests') }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-value mono">{{ health.requests.avg_response_ms }} ms</span>
              <span class="stat-desc">{{ t('systemHealth.avgResponse') }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-value mono">{{ health.requests.p95_response_ms }} ms</span>
              <span class="stat-desc">{{ t('systemHealth.p95Response') }}</span>
            </div>
          </div>
        </div>

        <!-- Errors -->
        <div class="card metric-card">
          <div class="metric-header">
            <h3 class="section-label">{{ t('systemHealth.errors') }}</h3>
            <span :class="['status-dot', `status-${health.thresholds.error_status}`]" />
          </div>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-value mono">{{ health.requests.errors_4xx }}</span>
              <span class="stat-desc">4xx</span>
            </div>
            <div class="stat-item">
              <span class="stat-value mono">{{ health.requests.errors_5xx }}</span>
              <span class="stat-desc">5xx</span>
            </div>
            <div class="stat-item">
              <span class="stat-value mono">{{ health.requests.error_rate_5xx_pct }}%</span>
              <span class="stat-desc">{{ t('systemHealth.errorRate') }}</span>
            </div>
          </div>
        </div>

        <!-- Recent Errors -->
        <div class="card metric-card">
          <div class="metric-header">
            <h3 class="section-label">{{ t('systemHealth.recentErrors') }}</h3>
          </div>
          <template v-if="health.recent_errors && health.recent_errors.length">
            <div class="error-list">
              <div v-for="(err, i) in health.recent_errors" :key="i" class="error-item">
                <div class="error-top">
                  <span class="mono error-method">{{ err.method }}</span>
                  <span class="mono error-path">{{ err.path }}</span>
                  <span class="mono error-status">{{ err.status }}</span>
                </div>
                <div class="error-bottom">
                  <span class="error-message">{{ err.message }}</span>
                  <span class="mono error-time">{{ formatDate(err.timestamp) }}</span>
                </div>
              </div>
            </div>
          </template>
          <p v-else class="unavailable">{{ t('systemHealth.noRecentErrors') }}</p>
        </div>

        <!-- Refresh -->
        <button class="btn-secondary refresh-btn" :disabled="loading" @click="load">
          {{ t('systemHealth.refresh') }}
        </button>
      </template>

      <div v-else class="empty-state">
        <p>{{ t('systemHealth.loadError') }}</p>
        <button class="btn-primary" @click="load">{{ t('common.retry') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api.js'
import AppHeader from '../../components/organisms/AppHeader.vue'
import { useToast } from '../../composables/useToast.js'
import { extractApiError, resolveError } from '../../utils/apiError.js'

const { t } = useI18n()
const toast = useToast()

const loading = ref(true)
const health = ref(null)

const heapStatus = computed(() => {
  if (!health.value) return 'green'
  const ratio = health.value.memory.heap_used_mb / health.value.memory.heap_total_mb
  if (ratio > 0.9) return 'red'
  if (ratio > 0.75) return 'yellow'
  return 'green'
})

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

async function load() {
  loading.value = true
  try {
    const res = await api.get('/system/health')
    health.value = res.data
  } catch (err) {
    toast.error(resolveError(extractApiError(err), t))
    health.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.info-card {
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.section-label {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text);
}

.metric-card {
  margin-bottom: 12px;
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.metric-header .section-label {
  margin-bottom: 0;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-green {
  background: var(--primary);
}

.status-yellow {
  background: var(--warning);
}

.status-red {
  background: var(--danger);
}

.status-unknown {
  background: var(--border);
}

.bar-group {
  margin-top: 10px;
}

.bar-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.bar-track {
  width: 100%;
  height: 8px;
  background: var(--bg);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}

.bar-green {
  background: var(--primary);
}

.bar-yellow {
  background: var(--warning);
}

.bar-red {
  background: var(--danger);
}

.metric-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.stat-item {
  text-align: center;
  padding: 8px 4px;
  background: var(--bg);
  border-radius: var(--radius-sm);
}

.stat-value {
  display: block;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text);
}

.stat-desc {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.table-list {
  margin-top: 8px;
  border-top: 1px solid var(--border);
}

.table-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.8125rem;
}

.table-row:last-child {
  border-bottom: none;
}

.table-name {
  color: var(--text);
}

.table-stats {
  display: flex;
  gap: 12px;
  color: var(--text-muted);
}

.unavailable {
  font-size: 0.875rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 8px 0 0;
}

.error-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-item {
  background: var(--bg);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  border-left: 3px solid var(--danger);
}

.error-top {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
}

.error-method {
  font-weight: 600;
  color: var(--text);
}

.error-path {
  color: var(--text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-status {
  color: var(--danger);
  font-weight: 600;
}

.error-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-top: 4px;
  font-size: 0.75rem;
}

.error-message {
  color: var(--text-muted);
  flex: 1;
  word-break: break-word;
}

.error-time {
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.refresh-btn {
  margin-top: 8px;
}
</style>
