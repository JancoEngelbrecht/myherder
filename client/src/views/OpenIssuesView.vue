<template>
  <div class="page">
    <AppHeader :title="t('healthIssues.openIssuesTitle')" :show-back="true" back-to="/" />

    <div class="page-content">
      <!-- Search -->
      <div class="search-bar">
        <SearchInput
          v-model="searchQuery"
          :placeholder="t('common.search.placeholder')"
          @update:model-value="onSearch"
        />
      </div>

      <!-- Filter tabs -->
      <div class="filter-tabs">
        <button
          v-for="f in filters"
          :key="f.value"
          class="filter-tab"
          :class="{ active: activeFilter === f.value }"
          @click="setFilter(f.value)"
        >
          {{ t(f.label) }}
          <span v-if="activeFilter === f.value" class="tab-count">{{
            healthIssuesStore.allIssuesTotal
          }}</span>
        </button>
      </div>

      <div v-if="healthIssuesStore.loadingAll" class="center-spinner">
        <div class="spinner" />
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn-secondary" style="width: auto; margin-top: 8px" @click="load">
          {{ t('common.retry') }}
        </button>
      </div>

      <template v-else>
        <div v-if="healthIssuesStore.allIssues.length === 0" class="empty-state">
          <p class="empty-state-text">{{ t('healthIssues.noIssues') }}</p>
        </div>

        <div v-else class="card issue-list-card">
          <RouterLink
            v-for="issue in healthIssuesStore.allIssues"
            :key="issue.id"
            :to="`/issues/${issue.id}`"
            class="issue-item"
          >
            <div class="issue-top">
              <span class="issue-icon">{{
                (issue.issue_types || [])
                  .map((c) => issueTypesStore.getByCode(c)?.emoji || '❓')
                  .join(' ')
              }}</span>
              <div class="issue-main">
                <span class="issue-type-label">{{
                  (issue.issue_types || [])
                    .map((c) => issueTypesStore.getByCode(c)?.name || c)
                    .join(' + ')
                }}</span>
                <span class="issue-cow"
                  >{{ issue.tag_number
                  }}<template v-if="issue.cow_name"> · {{ issue.cow_name }}</template></span
                >
              </div>
              <span class="issue-date mono">{{ formatDate(issue.observed_at) }}</span>
              <span class="issue-chevron">›</span>
            </div>
            <div class="issue-bottom">
              <span class="badge" :class="`issue-sev-${issue.severity}`">{{
                $t(`healthIssues.${issue.severity}`)
              }}</span>
              <span class="badge" :class="`issue-status-${issue.status}`">{{
                $t(`healthIssues.${issue.status}`)
              }}</span>
            </div>
          </RouterLink>
        </div>

        <!-- Pagination -->
        <PaginationBar
          :total="healthIssuesStore.allIssuesTotal"
          :page="page"
          :limit="limit"
          @update:page="onPageChange"
          @update:limit="onLimitChange"
        />
      </template>
    </div>

    <RouterLink to="/log/issue" class="fab" :title="t('healthIssues.logIssue')">+</RouterLink>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHealthIssuesStore } from '../stores/healthIssues'
import { useIssueTypesStore } from '../stores/issueTypes'
import { formatDate } from '../utils/format'
import AppHeader from '../components/organisms/AppHeader.vue'
import SearchInput from '../components/atoms/SearchInput.vue'
import PaginationBar from '../components/atoms/PaginationBar.vue'

const { t } = useI18n()
const healthIssuesStore = useHealthIssuesStore()
const issueTypesStore = useIssueTypesStore()

const error = ref('')
const searchQuery = ref('')
const activeFilter = ref('open')
const page = ref(1)
const limit = ref(20)

const filters = [
  { value: 'open', label: 'healthIssues.open' },
  { value: 'treating', label: 'healthIssues.treating' },
  { value: 'all', label: 'healthIssues.filterAll' },
]

function buildParams() {
  const params = { page: page.value, limit: limit.value }
  if (searchQuery.value) params.search = searchQuery.value
  if (activeFilter.value !== 'all') params.status = activeFilter.value
  return params
}

async function load() {
  error.value = ''
  try {
    await healthIssuesStore.fetchAll(buildParams())
  } catch {
    error.value = t('common.error')
  }
}

function onSearch() {
  page.value = 1
  load()
}

function setFilter(value) {
  activeFilter.value = value
  page.value = 1
  load()
}

function onPageChange(p) {
  page.value = p
  load()
}

function onLimitChange(l) {
  limit.value = l
  page.value = 1
  load()
}

onMounted(() => {
  load()
  if (!issueTypesStore.hasData) issueTypesStore.fetchAll()
})
</script>

<style scoped>
.search-bar {
  margin-bottom: 12px;
}

.filter-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}

.filter-tabs::-webkit-scrollbar {
  display: none;
}

.filter-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--radius-full, 9999px);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.filter-tab.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.tab-count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  background: rgba(0, 0, 0, 0.12);
  border-radius: 10px;
  padding: 0 6px;
  line-height: 1.6;
}

.filter-tab.active .tab-count {
  background: rgba(255, 255, 255, 0.25);
}

.center-spinner {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.error-state {
  text-align: center;
  padding: 24px;
  color: var(--danger);
}

.empty-state-text {
  font-size: 0.875rem;
  color: var(--text-muted);
  padding: 8px 0;
}

.issue-list-card {
  padding: 0 16px;
}

.issue-item {
  display: block;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
}

.issue-item:last-child {
  border-bottom: none;
}

.issue-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.issue-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.issue-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.issue-type-label {
  font-weight: 600;
  font-size: 0.9rem;
}

.issue-cow {
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.issue-date {
  font-size: 0.78rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.issue-chevron {
  color: var(--primary);
  font-size: 1.1rem;
  font-weight: 600;
  flex-shrink: 0;
}

.issue-bottom {
  display: flex;
  gap: 6px;
  margin-left: 32px;
}

.issue-sev-low {
  background: var(--primary-bg);
  color: var(--primary-dark);
  border-color: var(--primary-light);
}
.issue-sev-medium {
  background: var(--warning-light);
  color: var(--warning);
  border-color: rgba(217, 119, 6, 0.3);
}
.issue-sev-high {
  background: var(--danger-light);
  color: var(--danger);
  border-color: rgba(220, 38, 38, 0.3);
}

.issue-status-open {
  background: var(--warning-light);
  color: var(--warning);
  border-color: rgba(217, 119, 6, 0.3);
}
.issue-status-treating {
  background: var(--info-light);
  color: var(--info);
  border-color: rgba(37, 99, 235, 0.3);
}
.issue-status-resolved {
  background: var(--primary-bg);
  color: var(--primary-dark);
  border-color: var(--primary-light);
}

.badge {
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
