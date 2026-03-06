<template>
  <div class="page">
    <AppHeader :title="t('audit.title')" show-back back-to="/settings" />

    <div class="page-content audit-content">
      <!-- Filter chips -->
      <div class="filter-chips">
        <button
          v-for="type in entityTypeFilters"
          :key="type"
          class="chip"
          :class="{ active: filter === type }"
          @click="filter = type; page = 1; fetchLog()"
        >
          {{ type === 'all' ? t('audit.filterAll') : t(`audit.entityTypes.${type}`) }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="spinner-wrap"><div class="spinner" /></div>

      <!-- Empty state -->
      <div v-else-if="entries.length === 0" class="empty-state">
        <p>{{ t('audit.noEntries') }}</p>
      </div>

      <!-- Entries list -->
      <div v-else class="audit-list">
        <div v-for="entry in entries" :key="entry.id" class="card audit-card">
          <div class="audit-header">
            <span class="audit-action badge" :class="`badge-${entry.action}`">
              {{ t(`audit.${entry.action}`) }}
            </span>
            <span class="audit-entity badge badge-entity">
              {{ t(`audit.entityTypes.${entry.entity_type}`) || entry.entity_type }}
            </span>
            <span class="audit-user">{{ entry.user_full_name || entry.user_username || '—' }}</span>
          </div>
          <div class="audit-time mono">{{ formatDate(entry.created_at) }}</div>
          <button
            v-if="entry.old_values || entry.new_values"
            class="btn-link"
            @click="toggleExpanded(entry.id)"
          >
            {{ expanded.has(entry.id) ? t('audit.hideDetails') : t('audit.showDetails') }}
          </button>
          <div v-if="expanded.has(entry.id)" class="audit-diff">
            <div v-if="entry.old_values" class="diff-section">
              <span class="diff-label">{{ t('audit.oldValues') }}</span>
              <pre class="diff-pre mono">{{ formatJson(entry.old_values) }}</pre>
            </div>
            <div v-if="entry.new_values" class="diff-section">
              <span class="diff-label">{{ t('audit.newValues') }}</span>
              <pre class="diff-pre mono">{{ formatJson(entry.new_values) }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="total > pageSize" class="pagination">
        <button class="btn-secondary btn-sm" :disabled="page <= 1" @click="page--; fetchLog()">
          {{ t('common.pagination.previous') }}
        </button>
        <span class="page-info mono">{{ t('common.pagination.showing', { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total }) }}</span>
        <button class="btn-secondary btn-sm" :disabled="page * pageSize >= total" @click="page++; fetchLog()">
          {{ t('common.pagination.next') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import api from '../../services/api'

const { t } = useI18n()

const entries = ref([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = 25
const filter = ref('all')
const expanded = reactive(new Set())

const entityTypeFilters = ['all', 'user', 'cow', 'setting', 'health_issue', 'treatment', 'milk_record', 'breeding_event']

onMounted(() => fetchLog())

async function fetchLog() {
  loading.value = true
  try {
    const params = { page: page.value, limit: pageSize }
    if (filter.value !== 'all') params.entity_type = filter.value

    const { data } = await api.get('/audit-log', { params })
    entries.value = data.data
    total.value = data.total
  } catch {
    // error handled by api interceptor
  } finally {
    loading.value = false
  }
}

function toggleExpanded(id) {
  if (expanded.has(id)) {
    expanded.delete(id)
  } else {
    expanded.add(id)
  }
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}

function formatJson(obj) {
  if (!obj) return ''
  return JSON.stringify(obj, null, 2)
}
</script>

<style scoped>
.audit-content {
  padding-bottom: 100px;
}

.spinner-wrap {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.audit-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.audit-card {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.audit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.badge-create {
  background: var(--success-light);
  color: var(--primary-dark);
}

.badge-update {
  background: var(--warning-light, #fef3cd);
  color: var(--warning-dark, #856404);
}

.badge-delete {
  background: var(--danger-light, #f8d7da);
  color: var(--danger-dark, #721c24);
}

.badge-status_change {
  background: #e0e7ff;
  color: #3730a3;
}

.badge-dismiss {
  background: #f3e8ff;
  color: #6b21a8;
}

.badge-deactivate {
  background: var(--danger-light, #f8d7da);
  color: var(--danger-dark, #721c24);
}

.badge-entity {
  background: var(--bg);
  color: var(--text-secondary);
}

.audit-user {
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-left: auto;
}

.audit-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.btn-link {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.audit-diff {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.diff-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.diff-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.diff-pre {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.page-info {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.btn-sm {
  font-size: 0.8rem;
  padding: 6px 14px;
  width: auto;
}
</style>
