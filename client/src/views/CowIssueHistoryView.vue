<template>
  <div class="page">
    <AppHeader
      :title="cow ? cow.tag_number : ''"
      :show-back="true"
      :back-to="`/cows/${cowId}`"
    />

    <div class="page-content">
      <div v-if="loading" class="center-spinner">
        <div class="spinner" />
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn-secondary" style="width:auto;margin-top:8px" @click="load">{{ t('common.retry') }}</button>
      </div>

      <template v-else>
        <div class="list-header">
          <h2 class="list-title">{{ t('healthIssues.title') }}</h2>
          <RouterLink :to="`/log/issue?cow_id=${cowId}`" class="btn-primary btn-sm-pill">
            + {{ t('healthIssues.logIssue') }}
          </RouterLink>
        </div>

        <div v-if="cowIssues.length === 0" class="empty-state">
          <p class="empty-state-text">{{ t('healthIssues.noIssues') }}</p>
        </div>

        <div v-else class="card issue-list-card">
          <RouterLink
            v-for="issue in cowIssues"
            :key="issue.id"
            :to="`/issues/${issue.id}`"
            class="issue-item"
          >
            <div class="issue-top">
              <span class="issue-icon">{{ (issue.issue_types || []).map(c => issueTypesStore.getByCode(c)?.emoji || '❓').join(' ') }}</span>
              <span class="issue-type-label">{{ (issue.issue_types || []).map(c => issueTypesStore.getByCode(c)?.name || c).join(' + ') }}</span>
              <span class="issue-date mono">{{ formatDate(issue.observed_at) }}</span>
              <span class="issue-chevron">›</span>
            </div>
            <div class="issue-bottom">
              <span class="badge" :class="`issue-sev-${issue.severity}`">{{ $t(`healthIssues.${issue.severity}`) }}</span>
              <span class="badge" :class="`issue-status-${issue.status}`">{{ $t(`healthIssues.${issue.status}`) }}</span>
            </div>
          </RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCowsStore } from '../stores/cows.js'
import { useHealthIssuesStore } from '../stores/healthIssues.js'
import { useIssueTypesStore } from '../stores/issueTypes.js'
import { formatDate } from '../utils/format.js'
import AppHeader from '../components/organisms/AppHeader.vue'

const { t } = useI18n()
const route = useRoute()
const cowsStore = useCowsStore()
const healthIssuesStore = useHealthIssuesStore()
const issueTypesStore = useIssueTypesStore()

const cowId = route.params.id
const cow = ref(null)
const loading = ref(true)
const error = ref('')

const cowIssues = computed(() => healthIssuesStore.getCowIssues(cowId))

async function load() {
  loading.value = true
  error.value = ''
  try {
    cow.value = await cowsStore.fetchOne(cowId)
    await healthIssuesStore.fetchByCow(cowId)
  } catch {
    error.value = t('common.error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  if (!issueTypesStore.hasData) issueTypesStore.fetchAll()
})
</script>

<style scoped>
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

.issue-type-label {
  font-weight: 600;
  font-size: 0.9rem;
  flex: 1;
}

.issue-date {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.issue-chevron {
  color: var(--primary);
  font-size: 1.1rem;
  font-weight: 600;
}

.issue-bottom {
  display: flex;
  gap: 6px;
  margin-left: 32px;
}

/* Severity badges */
.issue-sev-low { background: var(--primary-bg); color: var(--primary-dark); border-color: var(--primary-light); }
.issue-sev-medium { background: var(--warning-light); color: var(--warning); border-color: rgba(217, 119, 6, 0.3); }
.issue-sev-high { background: var(--danger-light); color: var(--danger); border-color: rgba(220, 38, 38, 0.3); }

/* Status badges */
.issue-status-open { background: var(--warning-light); color: var(--warning); border-color: rgba(217, 119, 6, 0.3); }
.issue-status-treating { background: var(--info-light); color: var(--info); border-color: rgba(37, 99, 235, 0.3); }
.issue-status-resolved { background: var(--primary-bg); color: var(--primary-dark); border-color: var(--primary-light); }

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
