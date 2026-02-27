<template>
  <div class="page">
    <AppHeader
      :title="isEdit ? t('cowForm.titleEdit') : t('cowForm.titleAdd')"
      :show-back="true"
      :back-to="isEdit ? `/cows/${route.params.id}` : '/cows'"
    />

    <div class="page-content">
      <div v-if="fromCalving" class="calving-banner">
        {{ t('cowForm.fromCalvingBanner') }}
      </div>

      <form class="cow-form" @submit.prevent="handleSubmit">
        <!-- Tag Number -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.tagNumber') }} *</label>
          <input
            v-model="form.tag_number"
            type="text"
            class="form-input"
            :class="{ error: errors.tag_number }"
            :placeholder="t('cowForm.tagPlaceholder')"
            required
          />
          <span v-if="errors.tag_number" class="form-error">{{ errors.tag_number }}</span>
        </div>

        <!-- Name -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.name') }}</label>
          <input
            v-model="form.name"
            type="text"
            class="form-input"
            :placeholder="t('cowForm.namePlaceholder')"
          />
        </div>

        <!-- Breed Type -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.breed') }}</label>
          <select v-model="form.breed_type_id" class="form-select">
            <option :value="null">{{ t('cowForm.selectBreed') }}</option>
            <option v-for="bt in breedTypesStore.activeTypes" :key="bt.id" :value="bt.id">
              {{ bt.name }}
            </option>
          </select>
        </div>

        <!-- DOB -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.dob') }}</label>
          <input
            v-model="form.dob"
            type="date"
            class="form-input"
          />
        </div>

        <!-- Sex toggle -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.sex') }} *</label>
          <div class="sex-toggle">
            <button
              type="button"
              class="sex-btn"
              :class="{ active: form.sex === 'female' }"
              @click="form.sex = 'female'"
            >
              🐄 {{ t('cowForm.sexFemale') }}
            </button>
            <button
              type="button"
              class="sex-btn"
              :class="{ active: form.sex === 'male' }"
              @click="form.sex = 'male'"
            >
              🐂 {{ t('cowForm.sexMale') }}
            </button>
          </div>
          <span v-if="errors.sex" class="form-error">{{ errors.sex }}</span>
        </div>

        <!-- Bull-only fields -->
        <template v-if="form.sex === 'male'">
          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="form.is_external" type="checkbox" />
              {{ t('cowForm.isExternal') }}
            </label>
          </div>
          <div class="form-group">
            <label class="form-label">{{ t('cowForm.purpose') }}</label>
            <select v-model="form.purpose" class="form-select">
              <option :value="null">—</option>
              <option value="natural_service">{{ t('cowForm.purposeNatural') }}</option>
              <option value="ai_semen_donor">{{ t('cowForm.purposeAI') }}</option>
              <option value="both">{{ t('cowForm.purposeBoth') }}</option>
            </select>
          </div>
        </template>

        <!-- Dry flag (female only) -->
        <div v-if="form.sex === 'female'" class="form-group">
          <label class="checkbox-label">
            <input v-model="form.is_dry" type="checkbox" />
            {{ t('cowForm.isDry') }}
          </label>
        </div>

        <!-- Life phase override -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.lifePhaseOverride') }}</label>
          <select v-model="form.life_phase_override" class="form-select">
            <option :value="null">{{ t('cowForm.lifePhaseAuto') }}</option>
            <option value="calf">{{ t('lifePhase.calf') }}</option>
            <option value="heifer">{{ t('lifePhase.heifer') }}</option>
            <option value="cow">{{ t('lifePhase.cow') }}</option>
            <option value="young_bull">{{ t('lifePhase.young_bull') }}</option>
            <option value="bull">{{ t('lifePhase.bull') }}</option>
          </select>
        </div>

        <!-- Status -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.status') }}</label>
          <select v-model="form.status" class="form-select">
            <option v-for="s in statuses" :key="s" :value="s">{{ t(`status.${s}`) }}</option>
          </select>
        </div>

        <!-- Sire (male parent) -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.sire') }}</label>
          <CowSearchDropdown
            v-model="form.sire_id"
            :placeholder="t('cowForm.sirePlaceholder')"
            sex-filter="male"
          />
        </div>

        <!-- Dam (female parent) -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.dam') }}</label>
          <CowSearchDropdown
            v-model="form.dam_id"
            :placeholder="t('cowForm.damPlaceholder')"
            sex-filter="female"
          />
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.notes') }}</label>
          <textarea
            v-model="form.notes"
            class="form-input"
            rows="3"
            :placeholder="t('cowForm.notesPlaceholder')"
            style="resize: vertical;"
          />
        </div>

        <!-- API Error -->
        <div v-if="apiError" class="error-box">{{ apiError }}</div>

        <!-- Actions -->
        <div class="form-actions">
          <button type="submit" class="btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner" style="width:18px;height:18px;border-width:2px" />
            <span v-else>{{ t('cowForm.save') }}</span>
          </button>
          <button type="button" class="btn-secondary" @click="handleCancel">
            {{ t('cowForm.cancel') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCowsStore } from '../stores/cows.js'
import { useBreedTypesStore } from '../stores/breedTypes.js'
import AppHeader from '../components/organisms/AppHeader.vue'
import CowSearchDropdown from '../components/molecules/CowSearchDropdown.vue'
import { extractApiError, resolveError } from '../utils/apiError'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const cowsStore = useCowsStore()
const breedTypesStore = useBreedTypesStore()

const isEdit = computed(() => !!route.params.id && route.path.endsWith('/edit'))
const fromCalving = computed(() => route.query.from_calving === 'true')

const form = reactive({
  tag_number: '',
  name: '',
  breed_type_id: null,
  dob: '',
  sex: 'female',
  status: 'active',
  notes: '',
  sire_id: null,
  dam_id: null,
  is_external: false,
  purpose: null,
  life_phase_override: null,
  is_dry: false,
})

const errors = reactive({})
const apiError = ref('')
const saving = ref(false)

const statuses = ['active', 'dry', 'pregnant', 'sick', 'sold', 'dead']

onMounted(async () => {
  if (breedTypesStore.activeTypes.length === 0) breedTypesStore.fetchActive()

  if (isEdit.value) {
    try {
      const cow = await cowsStore.fetchOne(route.params.id)
      Object.assign(form, {
        tag_number: cow.tag_number || '',
        name: cow.name || '',
        breed_type_id: cow.breed_type_id || null,
        dob: cow.dob ? cow.dob.substring(0, 10) : '',
        sex: cow.sex || 'female',
        status: cow.status || 'active',
        notes: cow.notes || '',
        sire_id: cow.sire_id || null,
        dam_id: cow.dam_id || null,
        is_external: cow.is_external || false,
        purpose: cow.purpose || null,
        life_phase_override: cow.life_phase_override || null,
        is_dry: cow.is_dry || false,
      })
    } catch {
      apiError.value = t('common.error')
    }
  } else if (fromCalving.value) {
    // Pre-fill from calving event query params
    const q = route.query
    if (q.tag_number) form.tag_number = String(q.tag_number)
    if (q.sex) form.sex = String(q.sex)
    if (q.dob) form.dob = String(q.dob)
    if (q.dam_id) form.dam_id = String(q.dam_id)
    if (q.sire_id) form.sire_id = String(q.sire_id)
    if (q.breed_type_id) form.breed_type_id = String(q.breed_type_id)
  }
})

function validate() {
  Object.keys(errors).forEach(k => delete errors[k])
  if (!form.tag_number.trim()) errors.tag_number = t('cowForm.validationTag')
  if (!form.sex) errors.sex = t('cowForm.validationSex')
  return Object.keys(errors).length === 0
}

async function handleSubmit() {
  if (!validate()) return
  saving.value = true
  apiError.value = ''

  const payload = { ...form }
  if (!payload.dob) delete payload.dob
  if (!payload.sire_id) delete payload.sire_id
  if (!payload.dam_id) delete payload.dam_id
  // Clean up sex-specific fields
  if (payload.sex === 'female') {
    payload.is_external = false
    payload.purpose = null
  } else {
    payload.is_dry = false
  }

  try {
    if (isEdit.value) {
      await cowsStore.update(route.params.id, payload)
      router.replace(`/cows/${route.params.id}`)
    } else {
      const cow = await cowsStore.create(payload)
      router.replace(`/cows/${cow.id}`)
    }
  } catch (err) {
    apiError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function handleCancel() {
  if (isEdit.value) {
    router.push(`/cows/${route.params.id}`)
  } else {
    router.push('/cows')
  }
}
</script>

<style scoped>
.calving-banner {
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
  border-radius: var(--radius);
  padding: 10px 14px;
  font-size: 0.85rem;
  color: var(--primary-dark);
  margin-bottom: 12px;
}

.cow-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sex-toggle {
  display: flex;
  gap: 8px;
}

.sex-btn {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius);
  border: 1.5px solid var(--border);
  background: var(--surface);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  color: var(--text-secondary);
  font-family: var(--font-body);
}

.sex-btn.active {
  background: var(--primary-bg);
  border-color: var(--primary);
  color: var(--primary-dark);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  cursor: pointer;
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
</style>
