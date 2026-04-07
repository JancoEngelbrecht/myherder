<template>
  <div class="page">
    <AppHeader :title="$t('issueTypes.title')" show-back back-to="/settings" />

    <div class="page-content it-content">
      <!-- Add / Edit Form -->
      <div v-if="showForm" class="card form-card">
        <h3 class="form-title">
          {{ editing ? $t('issueTypes.editTitle') : $t('issueTypes.addTitle') }}
        </h3>
        <form @submit.prevent="save">
          <div class="form-row-2">
            <div class="form-group">
              <label>{{ $t('issueTypes.emoji') }} *</label>
              <div class="emoji-picker-wrap">
                <button
                  type="button"
                  class="emoji-trigger"
                  :class="{ open: emojiPickerOpen }"
                  @click="emojiPickerOpen = !emojiPickerOpen"
                >
                  <span v-if="form.emoji" class="emoji-trigger-selected">{{ form.emoji }}</span>
                  <span v-else class="emoji-trigger-placeholder">{{
                    $t('issueTypes.emojiPlaceholder')
                  }}</span>
                </button>
                <div v-if="emojiPickerOpen" class="emoji-grid">
                  <button
                    v-for="e in HEALTH_EMOJIS"
                    :key="e"
                    type="button"
                    class="emoji-option"
                    :class="{ selected: form.emoji === e }"
                    @click="selectEmoji(e)"
                  >
                    {{ e }}
                  </button>
                </div>
              </div>
            </div>
            <div class="form-group">
              <label for="it-name">{{ $t('issueTypes.name') }} *</label>
              <input
                id="it-name"
                v-model="form.name"
                class="form-input"
                required
                maxlength="100"
                :placeholder="$t('issueTypes.namePlaceholder')"
              />
            </div>
          </div>

          <div v-if="editing" class="form-group">
            <label class="info-label">{{ $t('issueTypes.code') }}</label>
            <span class="code-badge mono">{{ editing.code }}</span>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="form.requires_teat_selection" type="checkbox" />
              {{ $t('issueTypes.requiresTeatSelection') }}
            </label>
          </div>

          <div class="form-group">
            <label for="it-order">{{ $t('issueTypes.sortOrder') }}</label>
            <input
              id="it-order"
              v-model.number="form.sort_order"
              type="number"
              min="0"
              class="form-input sort-input"
            />
          </div>

          <p v-if="formError" class="form-error">{{ formError }}</p>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="cancelForm">
              {{ $t('common.cancel') }}
            </button>
            <button type="submit" class="btn-primary" :disabled="saving">
              {{ saving ? $t('common.saving') : $t('common.save') }}
            </button>
          </div>
        </form>
      </div>

      <!-- Page-level error (e.g. delete blocked) -->
      <div v-if="pageError" class="page-error">{{ pageError }}</div>

      <!-- Search (hidden while form is open) -->
      <div v-if="!showForm" data-tour="it-search" class="search-bar">
        <SearchInput
          v-model="searchQuery"
          :placeholder="$t('common.search.placeholder')"
          @update:model-value="onSearch"
        />
      </div>

      <!-- Loading -->
      <div v-if="loading && !showForm" class="spinner-wrap"><div class="spinner" /></div>

      <!-- Empty -->
      <div v-else-if="!showForm && allTypes.length === 0" class="empty-state">
        <p>{{ $t('issueTypes.empty') }}</p>
      </div>

      <!-- List -->
      <div v-else-if="!showForm" data-tour="it-list" class="it-list">
        <div
          v-for="type in allTypes"
          :key="type.id"
          class="card it-card"
          :class="{ inactive: !type.is_active }"
        >
          <div class="it-header">
            <div class="it-identity">
              <span class="it-emoji">{{ type.emoji }}</span>
              <div>
                <span class="it-name">{{ type.name }}</span>
                <span class="code-badge mono">{{ type.code }}</span>
              </div>
            </div>
            <span class="badge" :class="type.is_active ? 'badge-active' : 'badge-inactive'">
              {{ type.is_active ? $t('common.active') : $t('common.inactive') }}
            </span>
          </div>

          <div class="it-meta">
            <span v-if="type.requires_teat_selection" class="meta-pill teat"
              >🧬 {{ $t('issueTypes.requiresTeatSelection') }}</span
            >
            <span v-if="type.sort_order != null" class="meta-pill order"
              >#{{ type.sort_order }}</span
            >
          </div>

          <div class="it-actions">
            <button class="btn-secondary btn-sm" @click="openEdit(type)">
              {{ $t('common.edit') }}
            </button>
            <button
              v-if="type.is_active"
              class="btn-danger btn-sm"
              @click="confirmDeactivate(type)"
            >
              {{ $t('issueTypes.deactivate') }}
            </button>
            <button v-else class="btn-secondary btn-sm" @click="doActivate(type)">
              {{ $t('issueTypes.activate') }}
            </button>
            <button class="btn-danger btn-sm" @click="confirmDelete(type)">
              {{ $t('common.delete') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <PaginationBar
        v-if="!showForm"
        :total="store.total"
        :page="page"
        :limit="limit"
        @update:page="onPageChange"
        @update:limit="onLimitChange"
      />
    </div>

    <!-- FAB -->
    <button
      v-if="!showForm"
      data-tour="it-add"
      class="fab"
      :title="$t('issueTypes.addTitle')"
      @click="openAdd"
    >
      +
    </button>

    <TourButton above-fab @start-tour="startTour" />

    <!-- Delete ConfirmDialog -->
    <ConfirmDialog
      :show="!!deleteTarget"
      :message="deleteTarget ? $t('issueTypes.deleteConfirm', { name: deleteTarget.name }) : ''"
      :confirm-label="$t('common.delete')"
      :cancel-label="$t('common.cancel')"
      :loading="deleting"
      @confirm="doDelete"
      @cancel="deleteTarget = null"
    />

    <!-- Deactivate ConfirmDialog -->
    <ConfirmDialog
      :show="!!deactivateTarget"
      :message="
        deactivateTarget ? $t('issueTypes.deactivateConfirm', { name: deactivateTarget.name }) : ''
      "
      :confirm-label="$t('issueTypes.deactivate')"
      :cancel-label="$t('common.cancel')"
      :loading="deactivating"
      @confirm="doDeactivate"
      @cancel="deactivateTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useIssueTypesStore } from '../../stores/issueTypes'
import AppHeader from '../../components/organisms/AppHeader.vue'
import TourButton from '../../components/atoms/TourButton.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import SearchInput from '../../components/atoms/SearchInput.vue'
import PaginationBar from '../../components/atoms/PaginationBar.vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '../../composables/useToast'
import { useTour } from '../../composables/useTour'
import { extractApiError, resolveError } from '../../utils/apiError'

const { t } = useI18n()
const store = useIssueTypesStore()
const toast = useToast()

const { startTour } = useTour(
  'issue-type-management',
  () => [
    {
      element: '[data-tour="it-search"]',
      popover: {
        title: t('tour.issueTypeManagement.search.title'),
        description: t('tour.issueTypeManagement.search.desc'),
      },
    },
    {
      element: '[data-tour="it-list"]',
      popover: {
        title: t('tour.issueTypeManagement.list.title'),
        description: t('tour.issueTypeManagement.list.desc'),
      },
    },
    {
      element: '[data-tour="it-add"]',
      popover: {
        title: t('tour.issueTypeManagement.add.title'),
        description: t('tour.issueTypeManagement.add.desc'),
      },
    },
  ],
  { autoStart: false }
)

const searchQuery = ref('')
const page = ref(1)
const limit = ref(20)

function loadTypes() {
  store.fetchAll(true, {
    search: searchQuery.value || undefined,
    page: page.value,
    limit: limit.value,
  })
}

function onSearch() {
  page.value = 1
  loadTypes()
}

function onPageChange(p) {
  page.value = p
  loadTypes()
}

function onLimitChange(l) {
  limit.value = l
  page.value = 1
  loadTypes()
}

const HEALTH_EMOJIS = [
  '🩺',
  '💊',
  '🌡️',
  '💉',
  '🩹',
  '🩸',
  '🧪',
  '🦠',
  '🤒',
  '😷',
  '🤕',
  '🥵',
  '🥶',
  '😵',
  '👁️',
  '🦷',
  '🫁',
  '🫀',
  '🦶',
  '🐾',
  '🧬',
  '⚠️',
  '🔴',
  '🟠',
  '🟡',
  '🟢',
  '🔵',
  '❌',
  '✅',
  '🐄',
  '🥛',
  '🌿',
  '🌾',
  '🚿',
  '🔥',
  '❄️',
]

const emojiPickerOpen = ref(false)

function selectEmoji(e) {
  form.value.emoji = e
  emojiPickerOpen.value = false
}

const loading = computed(() => store.loading)
const allTypes = computed(() => store.issueTypes)

const showForm = ref(false)
const editing = ref(null)
const saving = ref(false)
const formError = ref('')

const pageError = ref('')
const deleteTarget = ref(null)
const deleting = ref(false)

const deactivateTarget = ref(null)
const deactivating = ref(false)

function emptyForm() {
  return { name: '', emoji: '', requires_teat_selection: false, sort_order: 0, is_active: true }
}

const form = ref(emptyForm())

onMounted(loadTypes)

function openAdd() {
  editing.value = null
  form.value = emptyForm()
  formError.value = ''
  showForm.value = true
}

function openEdit(type) {
  editing.value = type
  form.value = {
    name: type.name,
    emoji: type.emoji,
    requires_teat_selection: !!type.requires_teat_selection,
    sort_order: type.sort_order ?? 0,
    is_active: type.is_active,
  }
  formError.value = ''
  showForm.value = true
}

function cancelForm() {
  showForm.value = false
  editing.value = null
}

async function save() {
  saving.value = true
  formError.value = ''
  try {
    if (editing.value) {
      await store.update(editing.value.id, form.value)
    } else {
      await store.create(form.value)
    }
    showForm.value = false
    editing.value = null
  } catch (err) {
    formError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function confirmDeactivate(type) {
  deactivateTarget.value = type
}

async function doDeactivate() {
  deactivating.value = true
  try {
    await store.update(deactivateTarget.value.id, { ...deactivateTarget.value, is_active: false })
    deactivateTarget.value = null
  } catch (err) {
    toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    deactivating.value = false
  }
}

async function doActivate(type) {
  try {
    await store.update(type.id, { ...type, is_active: true })
  } catch (err) {
    toast.show(resolveError(extractApiError(err), t), 'error')
  }
}

function confirmDelete(type) {
  deleteTarget.value = type
  pageError.value = ''
}

async function doDelete() {
  deleting.value = true
  try {
    await store.remove(deleteTarget.value.id)
    deleteTarget.value = null
  } catch (err) {
    deleteTarget.value = null
    pageError.value = resolveError(extractApiError(err), t)
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.it-content {
  padding-bottom: 100px;
}

.form-card {
  margin: 0 auto 20px;
  padding: 20px;
  max-width: 600px;
}

.form-title {
  margin: 0 0 16px;
  font-size: 1rem;
  font-weight: 600;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 12px;
}

.info-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  display: block;
  margin-bottom: 4px;
}

.code-badge {
  display: inline-block;
  background: var(--border);
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.78rem;
}

.sort-input {
  max-width: 100px;
}

.emoji-picker-wrap {
  position: relative;
}

.emoji-trigger {
  width: 100%;
  height: 44px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  font-size: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s;
}

.emoji-trigger:hover,
.emoji-trigger.open {
  border-color: var(--primary);
}

.emoji-trigger-placeholder {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.emoji-grid {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  width: max-content;
  max-width: 320px;
}

.emoji-option {
  background: none;
  border: 1.5px solid transparent;
  border-radius: 6px;
  font-size: 1.35rem;
  width: 36px;
  height: 36px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.1s,
    border-color 0.1s;
}

.emoji-option:hover {
  background: var(--bg);
}

.emoji-option.selected {
  border-color: var(--primary);
  background: var(--bg);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
  cursor: pointer;
}

.checkbox-label input {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 16px;
}

.form-actions .btn-primary,
.form-actions .btn-secondary {
  width: auto;
  padding: 10px 20px;
}

.search-bar {
  margin-bottom: 16px;
}

.spinner-wrap {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.it-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.it-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.it-card.inactive {
  opacity: 0.6;
}

.it-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}

.it-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}

.it-emoji {
  font-size: 2rem;
  line-height: 1;
  flex-shrink: 0;
}

.it-name {
  font-weight: 600;
  font-size: 1rem;
  display: block;
  margin-bottom: 3px;
}

.it-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.meta-pill {
  font-size: 0.75rem;
  padding: 3px 8px;
  border-radius: var(--radius-full);
  font-weight: 500;
}

.meta-pill.teat {
  background: #e3f2fd;
  color: #1565c0;
}

.meta-pill.order {
  background: var(--border);
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

.it-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.badge-active {
  background: var(--success-light);
  color: var(--primary-dark);
}

.badge-inactive {
  background: var(--border);
  color: var(--text-secondary);
}

.page-error {
  background: var(--danger-light);
  color: var(--danger);
  border-radius: var(--radius);
  padding: 12px 16px;
  font-size: 0.875rem;
  margin-bottom: 16px;
}
</style>
