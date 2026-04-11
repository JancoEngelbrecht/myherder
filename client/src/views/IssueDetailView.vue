<template>
  <div class="page">
    <AppHeader :title="t('healthIssues.title')" :show-back="true" />

    <div class="page-content">
      <div v-if="loading" class="center-spinner">
        <div class="spinner" />
      </div>

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="btn-secondary" style="width: auto; margin-top: 8px" @click="load">
          {{ t('common.retry') }}
        </button>
      </div>

      <template v-else-if="issue">
        <!-- Date & cow -->
        <div class="card">
          <div class="detail-date mono">{{ formatDateTime(issue.observed_at) }}</div>
          <RouterLink :to="`/animals/${issue.animal_id}`" class="animal-row">
            <span class="animal-emoji"><AppIcon name="cow" :size="20" /></span>
            <div class="animal-info">
              <span class="animal-tag mono">{{ issue.tag_number }}</span>
              <span class="animal-name">{{ issue.animal_name || '—' }}</span>
            </div>
            <span class="animal-chevron">›</span>
          </RouterLink>
        </div>

        <!-- Issue type + severity -->
        <div class="card">
          <div class="issue-type-row">
            <span class="type-emoji">
              <template v-if="issueTypesStore.getByCode(issue.issue_types?.[0])?.emoji">{{
                issueTypesStore.getByCode(issue.issue_types[0]).emoji
              }}</template>
              <AppIcon v-else name="help-circle" :size="28" />
            </span>
            <div class="type-info">
              <span class="type-name">{{
                (issue.issue_types || [])
                  .map((c) => issueTypesStore.getByCode(c)?.name || c)
                  .join(' · ')
              }}</span>
              <span class="badge" :class="`issue-sev-${issue.severity}`">{{
                $t(`healthIssues.${issue.severity}`)
              }}</span>
            </div>
            <span class="badge" :class="`issue-status-${issue.status}`">{{
              $t(`healthIssues.${issue.status}`)
            }}</span>
          </div>
        </div>

        <!-- Affected teats (if any) -->
        <div v-if="affectedTeats.length" class="card">
          <h3 class="section-label">{{ t('healthIssues.affectedTeats') }}</h3>
          <TeatSelector :model-value="affectedTeats" readonly />
        </div>

        <!-- Description / notes -->
        <div v-if="issue.description" class="card">
          <h3 class="section-label">{{ t('healthIssues.description') }}</h3>
          <p class="notes-text">{{ issue.description }}</p>
        </div>

        <!-- Details -->
        <div class="card">
          <h3 class="section-label">{{ t('treatmentDetail.details') }}</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">{{ t('healthIssues.reportedBy') }}</span>
              <span class="detail-value">{{ issue.reported_by_name }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">{{ t('healthIssues.status') }}</span>
              <span class="detail-value">{{ $t(`healthIssues.${issue.status}`) }}</span>
            </div>
            <div v-if="issue.resolved_at" class="detail-item">
              <span class="detail-label">{{ t('healthIssues.resolved') }}</span>
              <span class="detail-value mono">{{ formatDate(issue.resolved_at) }}</span>
            </div>
          </div>
        </div>

        <!-- Comments -->
        <div class="card">
          <h3 class="section-label">{{ t('healthIssues.comments') }}</h3>

          <div v-if="loadingComments" class="comments-spinner">
            <div class="spinner" />
          </div>
          <p v-else-if="!commentsList.length" class="no-comments">
            {{ t('healthIssues.noComments') }}
          </p>
          <div v-else class="comment-list">
            <div v-for="c in commentsList" :key="c.id" class="comment-item">
              <div class="comment-meta">
                <span class="comment-author">{{ c.author_name }}</span>
                <span class="comment-time mono">{{ formatDateTime(c.created_at) }}</span>
                <button
                  v-if="authStore.isAdmin"
                  class="comment-delete-btn"
                  :aria-label="t('healthIssues.deleteComment')"
                  @click="deleteCommentId = c.id"
                >
                  ×
                </button>
              </div>
              <p class="comment-text">{{ c.comment }}</p>
            </div>
          </div>

          <div class="comment-input-row">
            <textarea
              v-model="newComment"
              class="form-input comment-textarea"
              :placeholder="t('healthIssues.commentPlaceholder')"
              rows="2"
            />
            <button
              class="btn-primary comment-submit"
              :disabled="!newComment.trim() || postingComment"
              @click="postComment"
            >
              {{ t('healthIssues.postComment') }}
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="actions-section">
          <template v-if="issue.status !== 'resolved'">
            <button
              v-if="issue.status === 'open'"
              class="btn-secondary action-btn"
              :disabled="updatingStatus"
              @click="setStatus('treating')"
            >
              {{ t('healthIssues.markTreating') }}
            </button>
            <button
              class="btn-primary action-btn"
              :disabled="updatingStatus"
              @click="setStatus('resolved')"
            >
              {{ t('healthIssues.markResolved') }}
            </button>
            <RouterLink
              :to="`/log/treatment?animal_id=${issue.animal_id}&health_issue_id=${route.params.id}`"
              class="btn-secondary action-btn log-treatment-link"
            >
              <AppIcon name="pill" :size="16" />
              {{ t('healthIssues.logTreatment') }}
            </RouterLink>
          </template>
          <button
            v-if="authStore.isAdmin"
            class="btn-danger action-btn"
            @click="showDeleteDialog = true"
          >
            <AppIcon name="trash-2" :size="16" />
            {{ t('common.delete') }}
          </button>
        </div>
      </template>
    </div>

    <ConfirmDialog
      :show="showDeleteDialog"
      :message="t('healthIssues.deleteConfirm')"
      :confirm-label="t('cowDetail.deleteYes')"
      :cancel-label="t('cowDetail.deleteNo')"
      :loading="deleting"
      @confirm="handleDelete"
      @cancel="showDeleteDialog = false"
    />

    <ConfirmDialog
      :show="!!deleteCommentId"
      :message="t('healthIssues.deleteCommentConfirm')"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      @confirm="confirmDeleteComment"
      @cancel="deleteCommentId = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useHealthIssuesStore } from '../stores/healthIssues'
import { useIssueTypesStore } from '../stores/issueTypes'
import { useAuthStore } from '../stores/auth'
import { formatDate, formatDateTime } from '../utils/format'
import { extractApiError, resolveError } from '../utils/apiError'
import AppHeader from '../components/organisms/AppHeader.vue'
import TeatSelector from '../components/molecules/TeatSelector.vue'
import ConfirmDialog from '../components/molecules/ConfirmDialog.vue'
import AppIcon from '../components/atoms/AppIcon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const healthIssuesStore = useHealthIssuesStore()
const issueTypesStore = useIssueTypesStore()
const authStore = useAuthStore()

const issue = ref(null)
const loading = ref(true)
const error = ref('')
const updatingStatus = ref(false)
const showDeleteDialog = ref(false)
const deleting = ref(false)
const newComment = ref('')
const loadingComments = ref(false)
const postingComment = ref(false)
const deleteCommentId = ref(null)

const commentsList = computed(() => healthIssuesStore.getComments(route.params.id))

const affectedTeats = computed(() => {
  const teats = issue.value?.affected_teats
  if (!teats) return []
  if (Array.isArray(teats)) return teats
  try {
    return JSON.parse(teats)
  } catch {
    return []
  }
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    issue.value = await healthIssuesStore.fetchOne(route.params.id)
  } catch {
    error.value = t('common.error')
  } finally {
    loading.value = false
  }
  loadingComments.value = true
  try {
    await healthIssuesStore.fetchComments(route.params.id)
  } finally {
    loadingComments.value = false
  }
}

async function postComment() {
  if (!newComment.value.trim()) return
  postingComment.value = true
  try {
    await healthIssuesStore.addComment(route.params.id, newComment.value.trim())
    newComment.value = ''
  } catch {
    error.value = t('common.error')
  } finally {
    postingComment.value = false
  }
}

async function confirmDeleteComment() {
  try {
    await healthIssuesStore.removeComment(route.params.id, deleteCommentId.value)
    deleteCommentId.value = null
  } catch {
    error.value = t('common.error')
  }
}

onMounted(() => {
  load()
  if (!issueTypesStore.hasData) issueTypesStore.fetchAll()
})

async function setStatus(status) {
  updatingStatus.value = true
  try {
    issue.value = await healthIssuesStore.updateStatus(route.params.id, status)
  } catch {
    error.value = t('common.error')
  } finally {
    updatingStatus.value = false
  }
}

async function handleDelete() {
  deleting.value = true
  try {
    await healthIssuesStore.remove(route.params.id)
    router.back()
  } catch (err) {
    error.value = resolveError(extractApiError(err), t)
    showDeleteDialog.value = false
  } finally {
    deleting.value = false
  }
}
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

.detail-date {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}

.animal-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
  text-decoration: none;
  color: var(--text);
}

.animal-emoji {
  display: flex;
  align-items: center;
  color: var(--text-secondary);
}

.animal-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
}

.animal-tag {
  font-size: 0.8rem;
  color: var(--primary);
  font-weight: 600;
}

.animal-name {
  font-size: 0.9rem;
  font-weight: 500;
}

.animal-chevron {
  color: var(--primary);
  font-size: 1.1rem;
  font-weight: 600;
}

.issue-type-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.type-emoji {
  font-size: 2rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  line-height: 1;
}

.type-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.type-name {
  font-weight: 700;
  font-size: 1rem;
}

.badge {
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: inline-block;
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

.section-label {
  display: block;
  margin-bottom: 10px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.notes-text {
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.detail-value {
  font-size: 0.9rem;
  font-weight: 500;
}

/* Responsive action buttons */
.actions-section {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}

.action-btn {
  flex: 1 1 100%;
  padding: 10px 16px;
  font-size: 0.875rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.log-treatment-link {
  text-decoration: none;
}

@media (min-width: 600px) {
  .action-btn {
    flex: 0 1 auto;
    width: auto;
  }
}

/* Comments */
.comments-spinner {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.no-comments {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin: 0 0 12px;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 14px;
}

.comment-item {
  border-left: 3px solid var(--border);
  padding-left: 10px;
}

.comment-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 3px;
}

.comment-author {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--primary);
}

.comment-time {
  font-size: 0.72rem;
  color: var(--text-muted);
  flex: 1;
}

.comment-delete-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.comment-delete-btn:hover {
  color: var(--danger);
}

.comment-text {
  font-size: 0.875rem;
  color: var(--text);
  line-height: 1.5;
  margin: 0;
}

.comment-input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin-top: 4px;
}

.comment-textarea {
  flex: 1;
  resize: none;
  min-height: 52px;
  font-size: 0.875rem;
}

.comment-submit {
  flex-shrink: 0;
  width: auto;
  padding: 0 16px;
  align-self: flex-end;
  height: 40px;
}
</style>
