<template>
  <div class="page">
    <AppHeader :title="t('farmGroups.title')" show-back back-to="/" show-avatar />

    <div class="page-content">
      <div class="list-header">
        <button class="btn-primary btn-sm-pill" @click="openCreateForm">
          + {{ t('farmGroups.createGroup') }}
        </button>
      </div>

      <!-- Create Form -->
      <div v-if="showCreateForm" class="card form-card">
        <h3 class="form-title">{{ t('farmGroups.createGroup') }}</h3>
        <form @submit.prevent="handleCreate">
          <div class="form-group">
            <label for="group-name">{{ t('farmGroups.groupName') }} *</label>
            <input
              id="group-name"
              v-model="createForm.name"
              class="form-input"
              required
              :placeholder="t('farmGroups.groupName')"
            />
          </div>

          <div class="form-group">
            <label>{{ t('farmGroups.selectFarms') }} * ({{ t('farmGroups.minTwoFarms') }})</label>
            <div class="farm-checkboxes">
              <label v-for="farm in unassignedFarms" :key="farm.id" class="farm-checkbox-label">
                <input v-model="createForm.selectedFarmIds" type="checkbox" :value="farm.id" />
                <span class="farm-checkbox-name">{{ farm.name }}</span>
                <span class="mono farm-checkbox-code">{{ farm.code }}</span>
              </label>
              <p v-if="unassignedFarms.length === 0" class="no-farms-hint">
                {{ t('farmGroups.noGroups') }}
              </p>
            </div>
          </div>

          <p v-if="createError" class="form-error">{{ createError }}</p>

          <div class="form-actions">
            <button type="button" class="btn-secondary" @click="closeCreateForm">
              {{ t('common.cancel') }}
            </button>
            <button type="submit" class="btn-primary" :disabled="creating">
              {{ creating ? t('common.saving') : t('common.save') }}
            </button>
          </div>
        </form>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="empty-state"><span class="spinner" /></div>

      <!-- Empty state -->
      <div v-else-if="!loading && groups.length === 0 && !showCreateForm" class="empty-state">
        <p>{{ t('farmGroups.noGroups') }}</p>
      </div>

      <!-- Groups list -->
      <div v-else class="groups-list">
        <div v-for="group in groups" :key="group.id" class="card group-card">
          <!-- Group header with inline edit -->
          <div class="group-header">
            <div v-if="editingGroupId === group.id" class="group-edit-row">
              <input
                v-model="editName"
                class="form-input edit-name-input"
                :placeholder="t('farmGroups.groupName')"
                @keydown.enter.prevent="handleRename(group)"
                @keydown.escape="cancelEdit"
              />
              <button
                class="btn-primary btn-sm-pill"
                :disabled="renaming"
                @click="handleRename(group)"
              >
                {{ renaming ? '...' : t('common.save') }}
              </button>
              <button class="btn-secondary btn-sm-pill" @click="cancelEdit">
                {{ t('common.cancel') }}
              </button>
            </div>
            <div v-else class="group-name-row">
              <h3 class="group-name">{{ group.name }}</h3>
              <button class="btn-secondary btn-sm-pill" @click="startEdit(group)">
                {{ t('farmGroups.editGroup') }}
              </button>
            </div>
          </div>

          <!-- Member farms -->
          <div class="member-farms-section">
            <p class="member-label">{{ t('farmGroups.memberFarms') }}</p>
            <div class="farm-chips">
              <span v-for="farm in group.farms" :key="farm.id" class="farm-chip">
                <span class="chip-name">{{ farm.name }}</span>
                <span class="mono chip-code">{{ farm.code }}</span>
                <button
                  class="chip-remove"
                  :title="t('farmGroups.removeFarm')"
                  @click="confirmRemoveFarm(group, farm)"
                >
                  ×
                </button>
              </span>
            </div>
          </div>

          <!-- Add farm row -->
          <div v-if="availableFarmsForGroup(group).length > 0" class="add-farm-row">
            <select v-model="addFarmSelections[group.id]" class="form-input add-farm-select">
              <option value="">{{ t('farmGroups.availableFarms') }}</option>
              <option v-for="farm in availableFarmsForGroup(group)" :key="farm.id" :value="farm.id">
                {{ farm.name }} ({{ farm.code }})
              </option>
            </select>
            <button
              class="btn-primary btn-sm-pill"
              :disabled="!addFarmSelections[group.id] || addingFarmToGroup === group.id"
              @click="handleAddFarm(group)"
            >
              {{ addingFarmToGroup === group.id ? '...' : t('farmGroups.addFarm') }}
            </button>
          </div>

          <!-- Delete group button -->
          <div class="group-footer">
            <button class="btn-danger btn-sm-pill" @click="confirmDeleteGroup(group)">
              {{ t('farmGroups.deleteGroup') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm delete group -->
    <ConfirmDialog
      :show="!!pendingDeleteGroup"
      :message="t('farmGroups.confirmDeleteGroup')"
      :confirm-label="t('farmGroups.deleteGroup')"
      :loading="deleting"
      @confirm="handleDeleteGroup"
      @cancel="pendingDeleteGroup = null"
    />

    <!-- Confirm remove farm -->
    <ConfirmDialog
      :show="!!pendingRemoveFarm"
      :message="t('farmGroups.confirmRemoveFarm')"
      :confirm-label="t('farmGroups.removeFarm')"
      :loading="removingFarm"
      @confirm="handleRemoveFarm"
      @cancel="pendingRemoveFarm = null"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api'
import AppHeader from '../../components/organisms/AppHeader.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import { useToast } from '../../composables/useToast'
import { extractApiError, resolveError } from '../../utils/apiError'

const { t } = useI18n()
const { showToast } = useToast()

// State
const groups = ref([])
const allFarms = ref([])
const loading = ref(true)

// Create form
const showCreateForm = ref(false)
const createForm = reactive({ name: '', selectedFarmIds: [] })
const creating = ref(false)
const createError = ref('')

// Edit (rename)
const editingGroupId = ref(null)
const editName = ref('')
const renaming = ref(false)

// Add farm per group
const addFarmSelections = reactive({})
const addingFarmToGroup = ref(null)

// Delete group
const pendingDeleteGroup = ref(null)
const deleting = ref(false)

// Remove farm
const pendingRemoveFarm = ref(null)
const removingFarm = ref(false)

// Computed: farms that are not yet in any group
const assignedFarmIds = computed(() => {
  const ids = new Set()
  groups.value.forEach((g) => g.farms.forEach((f) => ids.add(f.id)))
  return ids
})

const unassignedFarms = computed(() =>
  allFarms.value.filter((f) => !assignedFarmIds.value.has(f.id))
)

function availableFarmsForGroup(group) {
  const groupFarmIds = new Set(group.farms.map((f) => f.id))
  return allFarms.value
    .filter((f) => !assignedFarmIds.value.has(f.id) || groupFarmIds.has(f.id))
    .filter((f) => !groupFarmIds.has(f.id))
}

// Load data
async function loadData() {
  loading.value = true
  try {
    const [groupsRes, farmsRes] = await Promise.all([api.get('/farm-groups'), api.get('/farms')])
    groups.value = groupsRes.data
    allFarms.value = farmsRes.data
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

// Create form
function openCreateForm() {
  createForm.name = ''
  createForm.selectedFarmIds = []
  createError.value = ''
  showCreateForm.value = true
}

function closeCreateForm() {
  showCreateForm.value = false
  createError.value = ''
}

async function handleCreate() {
  if (createForm.selectedFarmIds.length < 2) {
    createError.value = t('farmGroups.minTwoFarms')
    return
  }
  creating.value = true
  createError.value = ''
  try {
    await api.post('/farm-groups', {
      name: createForm.name,
      farm_ids: createForm.selectedFarmIds,
    })
    showToast(t('farmGroups.groupCreated'), 'success')
    closeCreateForm()
    await loadData()
  } catch (err) {
    createError.value = resolveError(extractApiError(err), t)
  } finally {
    creating.value = false
  }
}

// Edit / rename
function startEdit(group) {
  editingGroupId.value = group.id
  editName.value = group.name
}

function cancelEdit() {
  editingGroupId.value = null
  editName.value = ''
}

async function handleRename(group) {
  if (!editName.value.trim()) return
  renaming.value = true
  try {
    await api.patch(`/farm-groups/${group.id}`, { name: editName.value.trim() })
    showToast(t('farmGroups.groupUpdated'), 'success')
    cancelEdit()
    await loadData()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    renaming.value = false
  }
}

// Add farm
async function handleAddFarm(group) {
  const farmId = addFarmSelections[group.id]
  if (!farmId) return
  addingFarmToGroup.value = group.id
  try {
    await api.post(`/farm-groups/${group.id}/farms`, { farm_ids: [farmId] })
    showToast(t('farmGroups.farmAdded'), 'success')
    addFarmSelections[group.id] = ''
    await loadData()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    addingFarmToGroup.value = null
  }
}

// Remove farm
function confirmRemoveFarm(group, farm) {
  pendingRemoveFarm.value = { group, farm }
}

async function handleRemoveFarm() {
  if (!pendingRemoveFarm.value) return
  const { group, farm } = pendingRemoveFarm.value
  removingFarm.value = true
  try {
    const { data } = await api.delete(`/farm-groups/${group.id}/farms/${farm.id}`)
    const autoDeleted =
      data?.message?.includes('auto-deleted') || data?.message?.includes('Group deleted')
    showToast(
      autoDeleted ? t('farmGroups.groupDeletedAutomatic') : t('farmGroups.farmRemoved'),
      'success'
    )
    pendingRemoveFarm.value = null
    await loadData()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    removingFarm.value = false
  }
}

// Delete group
function confirmDeleteGroup(group) {
  pendingDeleteGroup.value = group
}

async function handleDeleteGroup() {
  if (!pendingDeleteGroup.value) return
  deleting.value = true
  try {
    await api.delete(`/farm-groups/${pendingDeleteGroup.value.id}`)
    showToast(t('farmGroups.groupDeleted'), 'success')
    pendingDeleteGroup.value = null
    await loadData()
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
.list-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 16px;
}

.form-card {
  padding: 16px;
  margin-bottom: 16px;
}

.form-title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 16px;
}

.form-error {
  color: var(--danger);
  font-size: 0.875rem;
  margin: 8px 0 0;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.form-actions .btn-primary,
.form-actions .btn-secondary {
  width: auto;
  flex: 0 1 auto;
}

.farm-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.farm-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 0.9rem;
}

.farm-checkbox-name {
  font-weight: 600;
}

.farm-checkbox-code {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.no-farms-hint {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.group-card {
  padding: 16px;
}

.group-header {
  margin-bottom: 12px;
}

.group-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.group-name {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
}

.group-edit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.edit-name-input {
  flex: 1;
  min-width: 120px;
}

.group-edit-row .btn-primary,
.group-edit-row .btn-secondary {
  width: auto;
}

.group-name-row .btn-secondary {
  width: auto;
}

.member-farms-section {
  margin-bottom: 12px;
}

.member-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px;
}

.farm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.farm-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 4px 8px 4px 10px;
  font-size: 0.8125rem;
}

.chip-name {
  font-weight: 600;
}

.chip-code {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.chip-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1;
  padding: 0 2px;
  margin-left: 2px;
  transition: color 0.15s;
}

.chip-remove:hover {
  color: var(--danger);
}

.add-farm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.add-farm-select {
  flex: 1;
  min-width: 150px;
}

.add-farm-row .btn-primary {
  width: auto;
  flex: 0 1 auto;
}

.group-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.group-footer .btn-danger {
  width: auto;
}
</style>
