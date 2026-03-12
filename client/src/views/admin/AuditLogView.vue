<template>
  <div class="page">
    <AppHeader :title="t('audit.title')" show-back back-to="/settings" />

    <div class="page-content audit-content">
      <!-- Entity type filter chips -->
      <div class="filter-chips filter-chips-wrap">
        <button
          v-for="type in entityTypeFilters"
          :key="type"
          class="chip"
          :class="{ active: filter === type }"
          @click="setEntityFilter(type)"
        >
          {{ type === 'all' ? t('audit.filterAll') : t(`audit.entityTypes.${type}`) }}
        </button>
      </div>

      <!-- Advanced filters toggle -->
      <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
        {{ t('audit.advancedFilters') }}
        <span v-if="advancedFilterCount > 0" class="filter-badge">{{ advancedFilterCount }}</span>
        <span class="toggle-arrow" :class="{ open: showAdvanced }">&#9662;</span>
      </button>

      <div v-if="showAdvanced" class="advanced-filters">
        <!-- Action filter -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('audit.filterAction') }}</span>
          <select v-model="actionFilter" class="form-select filter-select" @change="onAdvancedChange">
            <option value="">{{ t('audit.allActions') }}</option>
            <option v-for="a in actionOptions" :key="a" :value="a">
              {{ t(`audit.${a}`) }}
            </option>
          </select>
        </div>

        <div class="filter-divider" />

        <!-- User filter -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('audit.filterUser') }}</span>
          <select v-model="userFilter" class="form-select filter-select" @change="onAdvancedChange">
            <option value="">{{ t('audit.allUsers') }}</option>
            <option v-for="u in users" :key="u.id" :value="u.id">
              {{ u.full_name || u.username }}
            </option>
          </select>
        </div>

        <div class="filter-divider" />

        <!-- Date range -->
        <div class="filter-group">
          <span class="filter-group-title">{{ t('audit.filterDateRange') }}</span>
          <div class="filter-range-row">
            <div class="filter-range-inputs">
              <input v-model="dateFrom" type="date" class="form-input filter-date-input" :placeholder="t('audit.filterFrom')" @change="onAdvancedChange" />
              <span class="filter-sep">–</span>
              <input v-model="dateTo" type="date" class="form-input filter-date-input" :placeholder="t('audit.filterTo')" @change="onAdvancedChange" />
            </div>
          </div>
        </div>

        <!-- Clear all button -->
        <button v-if="advancedFilterCount > 0" class="btn-secondary btn-sm clear-btn" @click="clearAdvanced">
          {{ t('audit.clearFilters') }}
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
      <PaginationBar
        :total="total"
        :page="page"
        :limit="limit"
        @update:page="onPageChange"
        @update:limit="onLimitChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import PaginationBar from '../../components/atoms/PaginationBar.vue'
import api from '../../services/api'

const { t } = useI18n()

const entries = ref([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const limit = ref(25)
const filter = ref('all')
const expanded = reactive(new Set())

// Advanced filter state
const showAdvanced = ref(false)
const actionFilter = ref('')
const userFilter = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const users = ref([])

const entityTypeFilters = ['all', 'user', 'cow', 'setting', 'health_issue', 'treatment', 'milk_record', 'breeding_event', 'medication']
const actionOptions = ['create', 'update', 'delete', 'status_change', 'dismiss', 'deactivate']

const advancedFilterCount = computed(() => {
  let n = 0
  if (actionFilter.value) n++
  if (userFilter.value) n++
  if (dateFrom.value) n++
  if (dateTo.value) n++
  return n
})

onMounted(() => {
  fetchLog()
  fetchUsers()
})

async function fetchUsers() {
  try {
    const { data } = await api.get('/users')
    users.value = data
  } catch {
    // non-critical — dropdown just stays empty
  }
}

async function fetchLog() {
  loading.value = true
  try {
    const params = { page: page.value, limit: limit.value }
    if (filter.value !== 'all') params.entity_type = filter.value
    if (actionFilter.value) params.action = actionFilter.value
    if (userFilter.value) params.user_id = userFilter.value
    if (dateFrom.value) params.from = dateFrom.value
    if (dateTo.value) params.to = dateTo.value

    const { data } = await api.get('/audit-log', { params })
    entries.value = data.data
    total.value = data.total
  } catch {
    // error handled by api interceptor
  } finally {
    loading.value = false
  }
}

function setEntityFilter(type) {
  filter.value = type
  page.value = 1
  fetchLog()
}

function onAdvancedChange() {
  page.value = 1
  fetchLog()
}

function clearAdvanced() {
  actionFilter.value = ''
  userFilter.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  page.value = 1
  fetchLog()
}

function onPageChange(p) {
  page.value = p
  fetchLog()
}

function onLimitChange(l) {
  limit.value = l
  page.value = 1
  fetchLog()
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

/* Advanced filter styles — matching CowListView pattern */
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0 12px;
}

.toggle-arrow {
  font-size: 0.7rem;
  transition: transform 0.2s;
}

.toggle-arrow.open {
  transform: rotate(180deg);
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  color: #fff;
  border-radius: 100px;
  font-size: 0.625rem;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
}

.advanced-filters {
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 12px;
}

.filter-group:last-child {
  padding-bottom: 4px;
}

.filter-group-title {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-secondary);
  opacity: 0.55;
}

.filter-divider {
  height: 1px;
  background: var(--border);
  margin: 0 0 12px;
}

.filter-select {
  max-width: 220px;
  font-size: 0.8125rem;
}

.filter-range-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-range-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-date-input {
  width: 140px;
  font-size: 0.8125rem;
  padding: 6px 10px;
}

.filter-sep {
  color: var(--text-secondary);
  font-size: 0.8rem;
  flex-shrink: 0;
}

.clear-btn {
  width: auto;
  align-self: flex-start;
  margin-top: 8px;
  font-size: 0.75rem;
  padding: 6px 14px;
}
</style>
