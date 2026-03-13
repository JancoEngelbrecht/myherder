<template>
  <div class="page">
    <AppHeader :title="$t('globalDefaults.pushDefaults')" show-back back-to="/" />

    <div class="page-content push-content">
      <div class="card push-card">
        <h3 class="form-title">{{ $t('globalDefaults.pushDescription') }}</h3>

        <!-- Entity Type Selection -->
        <div class="form-group">
          <label>{{ $t('globalDefaults.entityType') }}</label>
          <div class="chip-row">
            <button
              v-for="et in entityTypes"
              :key="et.value"
              class="chip"
              :class="{ active: selectedType === et.value }"
              @click="selectedType = et.value"
            >{{ et.label }}</button>
          </div>
        </div>

        <!-- Farm Selection -->
        <div class="form-group">
          <label>{{ $t('globalDefaults.selectFarms') }}</label>
          <label class="checkbox-label select-all">
            <input type="checkbox" :checked="allSelected" @change="toggleAll" />
            {{ $t('globalDefaults.selectAll') }}
          </label>
          <div v-if="loadingFarms" class="spinner-wrap"><div class="spinner" /></div>
          <div v-else class="farm-checkboxes">
            <label v-for="farm in farms" :key="farm.id" class="checkbox-label">
              <input v-model="selectedFarms" type="checkbox" :value="farm.id" />
              {{ farm.name }} <span class="mono farm-code">{{ farm.code }}</span>
            </label>
          </div>
        </div>

        <!-- Push Button -->
        <div class="form-actions">
          <button
            class="btn-primary"
            :disabled="pushing || selectedFarms.length === 0"
            @click="confirmPush"
          >
            {{ pushing ? $t('common.saving') : $t('globalDefaults.pushToFarms') }}
          </button>
        </div>

        <!-- Result -->
        <div v-if="result" class="result-card card">
          <p><strong>{{ $t('globalDefaults.pushed') }}:</strong> <span class="mono">{{ result.pushed }}</span></p>
          <p><strong>{{ $t('globalDefaults.skipped') }}:</strong> <span class="mono">{{ result.skipped }}</span></p>
          <p><strong>{{ $t('globalDefaults.farmsAffected') }}:</strong> <span class="mono">{{ result.farms_affected }}</span></p>
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>
      </div>
    </div>

    <ConfirmDialog
      :show="showConfirm"
      :message="$t('globalDefaults.pushConfirm', { type: selectedTypeLabel, count: selectedFarms.length })"
      :confirm-label="$t('globalDefaults.pushToFarms')"
      :cancel-label="$t('common.cancel')"
      :loading="pushing"
      @confirm="doPush"
      @cancel="showConfirm = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '../../services/api'
import AppHeader from '../../components/organisms/AppHeader.vue'
import ConfirmDialog from '../../components/molecules/ConfirmDialog.vue'
import { extractApiError, resolveError } from '../../utils/apiError'
import { useToast } from '../../composables/useToast.js'

const { t } = useI18n()
const { showToast } = useToast()

const entityTypes = computed(() => [
  { value: 'medications', label: t('globalDefaults.medications') },
  { value: 'issue-types', label: t('globalDefaults.issueTypes') },
  { value: 'breed-types', label: t('globalDefaults.breedTypes') },
])

const selectedType = ref('medications')
const selectedTypeLabel = computed(() => entityTypes.value.find((e) => e.value === selectedType.value)?.label || '')

const farms = ref([])
const loadingFarms = ref(true)
const selectedFarms = ref([])
const pushing = ref(false)
const showConfirm = ref(false)
const result = ref(null)
const error = ref('')

const allSelected = computed(() => farms.value.length > 0 && selectedFarms.value.length === farms.value.length)

function toggleAll(e) {
  selectedFarms.value = e.target.checked ? farms.value.map((f) => f.id) : []
}

onMounted(async () => {
  try {
    const { data } = await api.get('/farms?active=1')
    farms.value = data
  } catch (err) {
    showToast(resolveError(extractApiError(err), t), 'error')
  } finally {
    loadingFarms.value = false
  }
})

function confirmPush() {
  result.value = null
  error.value = ''
  showConfirm.value = true
}

async function doPush() {
  pushing.value = true
  error.value = ''
  try {
    const { data } = await api.post(`/global-defaults/${selectedType.value}/push`, {
      farm_ids: allSelected.value ? 'all' : selectedFarms.value,
    })
    result.value = data
    showConfirm.value = false
  } catch (err) {
    error.value = resolveError(extractApiError(err), t)
    showConfirm.value = false
  } finally {
    pushing.value = false
  }
}
</script>

<style scoped>
.push-content { padding-bottom: 40px; }
.push-card { padding: 20px; max-width: 600px; margin: 0 auto; }
.form-title { margin: 0 0 20px; font-size: 1rem; font-weight: 600; }
.chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { padding: 8px 16px; border-radius: var(--radius-full); border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-size: 0.85rem; }
.chip.active { background: var(--primary); color: white; border-color: var(--primary); }
.checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 0; }
.select-all { font-weight: 600; margin-bottom: 4px; }
.farm-checkboxes { max-height: 300px; overflow-y: auto; }
.farm-code { font-size: 0.8rem; color: var(--text-muted); }
.form-actions { margin-top: 20px; }
.form-actions .btn-primary { width: auto; padding: 10px 24px; }
.result-card { margin-top: 16px; padding: 16px; background: var(--success-light); }
.result-card p { margin: 4px 0; }
.spinner-wrap { display: flex; justify-content: center; padding: 20px; }
</style>
