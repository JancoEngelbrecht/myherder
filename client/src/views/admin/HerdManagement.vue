<template>
  <div class="page">
    <AppHeader :title="t('herdManagement.title')" show-back back-to="/settings" />

    <div class="page-content">
      <!-- ── Batch Create ─────────────────────────────────────── -->
      <section class="hm-section card">
        <h2 class="section-heading">{{ t('herdManagement.batchCreate') }}</h2>
        <p class="section-desc">{{ t('herdManagement.batchCreateDesc') }}</p>

        <h3 class="sub-heading">{{ t('herdManagement.sharedDefaults') }}</h3>

        <div class="defaults-grid">
          <div class="form-group">
            <label class="form-label">{{ t('herdManagement.breed') }}</label>
            <select v-model="defaults.breed_type_id" class="form-input">
              <option value="">— {{ t('herdManagement.breed') }} —</option>
              <option v-for="bt in breedTypesStore.activeTypes" :key="bt.id" :value="bt.id">
                {{ bt.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('herdManagement.sex') }}</label>
            <div class="sex-toggle">
              <button
                type="button"
                class="sex-btn"
                :class="{ active: defaults.sex === 'female' }"
                @click="defaults.sex = 'female'"
              >
                {{ t('herdManagement.sexFemale') }}
              </button>
              <button
                type="button"
                class="sex-btn"
                :class="{ active: defaults.sex === 'male' }"
                @click="defaults.sex = 'male'"
              >
                {{ t('herdManagement.sexMale') }}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('herdManagement.status') }}</label>
            <select v-model="defaults.status" class="form-input">
              <option v-for="s in ANIMAL_STATUSES" :key="s" :value="s">
                {{ t(`status.${s}`) }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('herdManagement.lifePhase') }}</label>
            <select v-model="defaults.life_phase_override" class="form-input">
              <option :value="null">{{ t('herdManagement.lifePhaseAuto') }}</option>
              <option v-for="phase in lifePhaseOptions" :key="phase.code" :value="phase.code">
                {{ t(`lifePhase.${phase.code}`) }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">{{ t('herdManagement.tagsLabel') }}</label>
          <textarea
            v-model="tagsInput"
            class="form-input tags-textarea"
            :placeholder="t('herdManagement.tagsPlaceholder')"
            rows="4"
          />
        </div>

        <!-- Tag chip preview -->
        <div v-if="parsedTags.length > 0" class="tag-preview">
          <span class="preview-count">
            {{ t('herdManagement.tagPreview', parsedTags.length) }}
          </span>
          <div class="chip-row">
            <span
              v-for="tag in parsedTags"
              :key="tag"
              class="chip"
              :class="{ 'chip-duplicate': duplicateTagSet.has(tag) }"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Duplicate warning -->
        <p v-if="duplicateTags.length > 0" class="error-msg">
          {{ t('herdManagement.duplicateTags', { tags: duplicateTags.join(', ') }) }}
        </p>

        <!-- Existing tags panel (409 response) -->
        <div v-if="existingTags.length > 0" class="existing-panel">
          <strong>{{ t('herdManagement.existingTags') }}:</strong>
          <span v-for="tag in existingTags" :key="tag" class="chip chip-existing">{{ tag }}</span>
        </div>

        <button
          class="btn-primary create-btn"
          :disabled="parsedTags.length === 0 || duplicateTags.length > 0 || creating"
          @click="submitBatchCreate"
        >
          {{ creating ? t('common.saving') : t('herdManagement.addAnimals', parsedTags.length) }}
        </button>
      </section>

      <!-- ── Bulk Delete ──────────────────────────────────────── -->
      <section class="hm-section card">
        <h2 class="section-heading">{{ t('herdManagement.removeAnimals') }}</h2>

        <input
          v-model="searchQuery"
          type="search"
          class="form-input search-input"
          :placeholder="t('herdManagement.search')"
          @input="onSearchInput"
        />

        <div v-if="listLoading" class="spinner-wrap">
          <div class="spinner" />
        </div>

        <template v-else-if="animalList.length > 0">
          <div class="select-actions">
            <button class="btn-link" @click="selectAll">{{ t('herdManagement.selectAll') }}</button>
            <button class="btn-link" @click="clearSelection">
              {{ t('herdManagement.clearAll') }}
            </button>
          </div>

          <ul class="animal-list">
            <li
              v-for="animal in animalList"
              :key="animal.id"
              class="animal-row"
              :class="{ selected: selectedIds.includes(animal.id) }"
              @click="toggleSelect(animal.id)"
            >
              <input
                type="checkbox"
                :checked="selectedIds.includes(animal.id)"
                class="row-checkbox"
                @click.stop
                @change="toggleSelect(animal.id)"
              />
              <span class="row-tag mono">{{ animal.tag_number }}</span>
              <span class="row-name">{{ animal.name || animal.tag_number }}</span>
              <span class="badge" :class="animal.sex === 'male' ? 'badge-male' : 'badge-female'">
                {{
                  animal.sex === 'male'
                    ? t('herdManagement.sexMale')
                    : t('herdManagement.sexFemale')
                }}
              </span>
            </li>
          </ul>

          <!-- Pagination -->
          <div v-if="totalAnimals > PAGE_SIZE" class="pagination">
            <button
              class="btn-secondary btn-sm"
              :disabled="currentPage === 1"
              @click="loadPage(currentPage - 1)"
            >
              ‹
            </button>
            <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
            <button
              class="btn-secondary btn-sm"
              :disabled="currentPage >= totalPages"
              @click="loadPage(currentPage + 1)"
            >
              ›
            </button>
          </div>
        </template>

        <p v-else class="empty-state">{{ t('herdManagement.noAnimals') }}</p>

        <!-- Delete bar -->
        <div v-if="selectedIds.length > 0" class="delete-bar">
          <span class="selected-count">{{ selectedIds.length }} selected</span>
          <button class="btn-danger" @click="showDeleteDialog = true">
            {{ t('herdManagement.deleteSelected', selectedIds.length) }}
          </button>
        </div>
      </section>
    </div>

    <ConfirmDialog
      :show="showDeleteDialog"
      :message="t('herdManagement.confirmDelete', selectedIds.length)"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      :loading="deleting"
      @confirm="executeBatchDelete"
      @cancel="showDeleteDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '../../components/organisms/AppHeader.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import { useAnimalsStore } from '../../stores/animals'
import { useBreedTypesStore } from '../../stores/breedTypes'
import { useToast } from '../../composables/useToast'
import { useSpeciesTerms } from '../../composables/useSpeciesTerms'
import { extractApiError, resolveError } from '../../utils/apiError'
import api from '../../services/api'

const { t } = useI18n()
const animalsStore = useAnimalsStore()
const breedTypesStore = useBreedTypesStore()
const toast = useToast()
const { lifePhasesConfig } = useSpeciesTerms()

const ANIMAL_STATUSES = ['active', 'dry', 'pregnant', 'sick', 'sold', 'dead']
const PAGE_SIZE = 20

// ── Batch Create state ────────────────────────────────────────

const defaults = reactive({
  breed_type_id: '',
  sex: 'female',
  status: 'active',
  life_phase_override: null,
})

// Life phase options from species config, filtered by current sex
const lifePhaseOptions = computed(() => {
  const phases = lifePhasesConfig.value
  if (!phases) {
    if (defaults.sex === 'male') return [{ code: 'calf' }, { code: 'young_bull' }, { code: 'bull' }]
    return [{ code: 'calf' }, { code: 'heifer' }, { code: 'cow' }]
  }
  return defaults.sex === 'male' ? (phases.male ?? []) : (phases.female ?? [])
})

// Reset life phase override when sex changes if current value is incompatible
watch(
  () => defaults.sex,
  () => {
    const allowed = new Set([null, ...lifePhaseOptions.value.map((p) => p.code)])
    if (!allowed.has(defaults.life_phase_override)) {
      defaults.life_phase_override = null
    }
  }
)

const tagsInput = ref('')
const creating = ref(false)
const existingTags = ref([])

const parsedTags = computed(() => {
  return tagsInput.value
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
})

const duplicateTags = computed(() => {
  const seen = new Set()
  const dupes = new Set()
  for (const tag of parsedTags.value) {
    if (seen.has(tag)) dupes.add(tag)
    seen.add(tag)
  }
  return Array.from(dupes)
})

const duplicateTagSet = computed(() => new Set(duplicateTags.value))

async function submitBatchCreate() {
  creating.value = true
  existingTags.value = []
  try {
    const payload = {
      defaults: {
        breed_type_id: defaults.breed_type_id || undefined,
        sex: defaults.sex,
        status: defaults.status,
        life_phase_override: defaults.life_phase_override || undefined,
      },
      tags: parsedTags.value,
    }
    const result = await animalsStore.batchCreate(payload)
    toast.show(t('herdManagement.successCreated', result.animals.length), 'success')
    tagsInput.value = ''
    await loadPage(1)
  } catch (err) {
    if (err.response?.status === 409 && err.response?.data?.existing_tags) {
      existingTags.value = err.response.data.existing_tags
    }
    toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    creating.value = false
  }
}

// ── Bulk Delete state ─────────────────────────────────────────

const searchQuery = ref('')
const animalList = ref([])
const totalAnimals = ref(0)
const currentPage = ref(1)
const listLoading = ref(false)
const selectedIds = ref([])
const showDeleteDialog = ref(false)
const deleting = ref(false)

let searchTimer = null

const totalPages = computed(() => Math.max(1, Math.ceil(totalAnimals.value / PAGE_SIZE)))

async function loadPage(page) {
  listLoading.value = true
  currentPage.value = page
  try {
    const params = { page, limit: PAGE_SIZE }
    if (searchQuery.value.trim()) params.search = searchQuery.value.trim()
    const response = await api.get('/animals', { params })
    animalList.value = response.data
    totalAnimals.value = parseInt(response.headers['x-total-count'] ?? '0', 10)
  } catch (err) {
    toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    listLoading.value = false
  }
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    selectedIds.value = []
    loadPage(1)
  }, 300)
}

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1) {
    selectedIds.value.push(id)
  } else {
    selectedIds.value.splice(idx, 1)
  }
}

function selectAll() {
  selectedIds.value = animalList.value.map((a) => a.id)
}

function clearSelection() {
  selectedIds.value = []
}

async function executeBatchDelete() {
  deleting.value = true
  try {
    await animalsStore.batchDelete(selectedIds.value)
    const count = selectedIds.value.length
    toast.show(t('herdManagement.successDeleted', count), 'success')
    selectedIds.value = []
    showDeleteDialog.value = false
    await loadPage(1)
  } catch (err) {
    toast.show(resolveError(extractApiError(err), t), 'error')
  } finally {
    deleting.value = false
  }
}

onMounted(async () => {
  if (!breedTypesStore.hasData) await breedTypesStore.fetchActive()
  await loadPage(1)
})
</script>

<style scoped>
.hm-section {
  padding: 20px;
  margin-bottom: 16px;
}

.section-heading {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 6px;
}

.section-desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0 0 16px;
}

.sub-heading {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.defaults-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin-bottom: 12px;
}

@media (max-width: 480px) {
  .defaults-grid {
    grid-template-columns: 1fr;
  }
}

.sex-toggle {
  display: flex;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border);
}

.sex-btn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: var(--bg);
  color: var(--text-secondary);
  font-size: 0.875rem;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
  width: auto;
}

.sex-btn.active {
  background: var(--primary);
  color: #fff;
}

.tags-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
}

.tag-preview {
  margin-bottom: 10px;
}

.preview-count {
  font-size: 0.8rem;
  color: var(--text-secondary);
  display: block;
  margin-bottom: 8px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-block;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.8rem;
  font-family: 'JetBrains Mono', monospace;
}

.chip-duplicate {
  background: #fde8e8;
  border-color: var(--danger);
  color: var(--danger);
}

.chip-existing {
  background: #fff3cd;
  border-color: var(--warning);
  color: var(--warning);
}

.error-msg {
  font-size: 0.8125rem;
  color: var(--danger);
  margin: 8px 0;
}

.existing-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  background: #fff3cd;
  border: 1px solid var(--warning);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 0.8125rem;
}

.create-btn {
  margin-top: 12px;
}

.search-input {
  margin-bottom: 12px;
}

.select-actions {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

.btn-link {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 0;
  width: auto;
  text-decoration: underline;
}

.animal-list {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.animal-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s;
}

.animal-row.selected {
  background: #e8f5ee;
  outline: 1.5px solid var(--primary);
}

.row-checkbox {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.row-tag {
  font-size: 0.85rem;
  font-weight: 600;
  min-width: 70px;
}

.row-name {
  flex: 1;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-male {
  background: #dbeafe;
  color: #1d4ed8;
}

.badge-female {
  background: #fce7f3;
  color: #be185d;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}

.page-info {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.spinner-wrap {
  display: flex;
  justify-content: center;
  padding: 32px;
}

.delete-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-top: 12px;
  gap: 12px;
}

.selected-count {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.delete-bar .btn-danger {
  width: auto;
  padding: 8px 16px;
  font-size: 0.875rem;
}

.form-label {
  display: block;
  font-size: 0.82rem;
  font-weight: 500;
  margin-bottom: 4px;
}
</style>
