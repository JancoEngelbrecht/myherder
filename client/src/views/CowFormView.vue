<template>
  <div class="page">
    <AppHeader
      :title="pageTitle"
      :show-back="true"
      :back-to="isEdit ? `/cows/${route.params.id}` : '/cows'"
    />

    <div class="page-content">
      <!-- Offspring progress banner -->
      <div v-if="isOffspringMode" class="offspring-banner">
        <div class="offspring-progress-text">
          {{
            t('animalForm.offspringProgress', { current: offspringIndex, total: offspringTotal })
          }}
        </div>
        <div class="offspring-progress-bar">
          <div
            class="offspring-progress-fill"
            :style="{ width: `${(offspringIndex / offspringTotal) * 100}%` }"
          />
        </div>
      </div>

      <div v-else-if="fromCalving" class="calving-banner">
        {{ t('animalForm.fromCalvingBanner') }}
      </div>

      <form class="cow-form" @submit.prevent="handleSubmit">
        <!-- Tag Number -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.tagNumber') }} *</label>
          <input
            v-model="form.tag_number"
            type="text"
            class="form-input"
            :class="{ error: errors.tag_number }"
            :placeholder="t('animalForm.tagPlaceholder')"
            required
          />
          <span v-if="errors.tag_number" class="form-error">{{ errors.tag_number }}</span>
        </div>

        <!-- Name -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.name') }}</label>
          <input
            v-model="form.name"
            type="text"
            class="form-input"
            :placeholder="t('animalForm.namePlaceholder')"
          />
        </div>

        <!-- Breed Type — filtered to farm's species -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.breed') }}</label>
          <select v-model="form.breed_type_id" class="form-select">
            <option :value="null">{{ t('animalForm.selectBreed') }}</option>
            <option v-for="bt in speciesFilteredBreeds" :key="bt.id" :value="bt.id">
              {{ bt.name }}
            </option>
          </select>
        </div>

        <!-- DOB -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.dob') }}</label>
          <input v-model="form.dob" type="date" class="form-input" />
        </div>

        <!-- Sex toggle -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.sex') }} *</label>
          <div class="sex-toggle">
            <button
              type="button"
              class="sex-btn"
              :class="{ active: form.sex === 'female' }"
              @click="form.sex = 'female'"
            >
              {{ speciesEmoji.female }} {{ t('animalForm.sexFemale') }}
            </button>
            <button
              type="button"
              class="sex-btn"
              :class="{ active: form.sex === 'male' }"
              @click="form.sex = 'male'"
            >
              {{ speciesEmoji.male }} {{ t('animalForm.sexMale') }}
            </button>
          </div>
          <span v-if="errors.sex" class="form-error">{{ errors.sex }}</span>
        </div>

        <!-- Male-only fields -->
        <template v-if="form.sex === 'male'">
          <div class="form-group">
            <label class="checkbox-label">
              <input v-model="form.is_external" type="checkbox" />
              {{ t('animalForm.isExternal') }}
            </label>
          </div>
          <div class="form-group">
            <label class="form-label">{{ t('animalForm.purpose') }}</label>
            <select v-model="form.purpose" class="form-select">
              <option :value="null">—</option>
              <option value="natural_service">{{ t('animalForm.purposeNatural') }}</option>
              <option value="ai_semen_donor">{{ t('animalForm.purposeAI') }}</option>
              <option value="both">{{ t('animalForm.purposeBoth') }}</option>
            </select>
          </div>
        </template>

        <!-- Life phase override — species-specific options -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.lifePhaseOverride') }}</label>
          <select v-model="form.life_phase_override" class="form-select">
            <option :value="null">{{ t('animalForm.lifePhaseAuto') }}</option>
            <option v-for="phase in lifePhaseOptions" :key="phase.code" :value="phase.code">
              {{ t(`lifePhase.${phase.code}`) }}
            </option>
          </select>
        </div>

        <!-- Status -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.status') }}</label>
          <select v-model="form.status" class="form-select">
            <option v-for="s in statuses" :key="s" :value="s">{{ t(`status.${s}`) }}</option>
          </select>
        </div>

        <!-- Sire (male parent) -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.sire') }}</label>
          <CowSearchDropdown
            v-model="form.sire_id"
            :placeholder="t('animalForm.sirePlaceholder')"
            sex-filter="male"
          />
        </div>

        <!-- Dam (female parent) -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.dam') }}</label>
          <CowSearchDropdown
            v-model="form.dam_id"
            :placeholder="t('animalForm.damPlaceholder')"
            sex-filter="female"
          />
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label class="form-label">{{ t('animalForm.notes') }}</label>
          <textarea
            v-model="form.notes"
            class="form-input"
            rows="3"
            :placeholder="t('animalForm.notesPlaceholder')"
            style="resize: vertical"
          />
        </div>

        <!-- API Error -->
        <div v-if="apiError" class="error-box">{{ apiError }}</div>

        <!-- Actions — offspring mode has Save & Next / Save & Done / Skip -->
        <div class="form-actions">
          <template v-if="isOffspringMode">
            <button
              v-if="!isLastOffspring"
              type="submit"
              class="btn-primary"
              :disabled="saving"
              @click="offspringAction = 'next'"
            >
              <span
                v-if="saving"
                class="spinner"
                style="width: 18px; height: 18px; border-width: 2px"
              />
              <span v-else>{{ t('animalForm.saveAndNext') }}</span>
            </button>
            <button
              type="submit"
              class="btn-primary"
              :disabled="saving"
              @click="offspringAction = 'done'"
            >
              <span
                v-if="saving"
                class="spinner"
                style="width: 18px; height: 18px; border-width: 2px"
              />
              <span v-else>{{ t('animalForm.saveAndDone') }}</span>
            </button>
            <button type="button" class="btn-secondary" @click="handleSkipOffspring">
              {{ t('animalForm.skipOffspring') }}
            </button>
          </template>
          <template v-else>
            <button type="submit" class="btn-primary" :disabled="saving">
              <span
                v-if="saving"
                class="spinner"
                style="width: 18px; height: 18px; border-width: 2px"
              />
              <span v-else>{{ t('animalForm.save', { species: singular }) }}</span>
            </button>
            <button type="button" class="btn-secondary" @click="handleCancel">
              {{ t('animalForm.cancel') }}
            </button>
          </template>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useCowsStore } from '../stores/cows.js'
import { useBreedTypesStore } from '../stores/breedTypes.js'
import { useSpeciesTerms } from '../composables/useSpeciesTerms.js'
import AppHeader from '../components/organisms/AppHeader.vue'
import CowSearchDropdown from '../components/molecules/CowSearchDropdown.vue'
import { extractApiError, resolveError } from '../utils/apiError'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const cowsStore = useCowsStore()
const breedTypesStore = useBreedTypesStore()
const { singular, emoji: speciesEmoji, lifePhasesConfig } = useSpeciesTerms()

const isEdit = computed(() => !!route.params.id && route.path.endsWith('/edit'))
const fromCalving = computed(() => route.query.from_calving === 'true')

// Offspring mode: triggered by birth_event_id query param
const isOffspringMode = computed(() => !!route.query.birth_event_id)
const offspringTotal = computed(() => Number(route.query.offspring_total ?? 1))
const offspringIndex = computed(() => Number(route.query.offspring_index ?? 1))
const isLastOffspring = computed(() => offspringIndex.value >= offspringTotal.value)
const offspringAction = ref('done') // 'next' or 'done'

const pageTitle = computed(() => {
  if (isEdit.value) return t('animalForm.titleEdit', { species: singular.value })
  if (isOffspringMode.value)
    return t('animalForm.offspringProgress', {
      current: offspringIndex.value,
      total: offspringTotal.value,
    })
  return t('animalForm.titleAdd', { species: singular.value })
})

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
})

const errors = reactive({})

// Species-filtered breed list
const speciesFilteredBreeds = computed(() => breedTypesStore.activeTypes)

// Life phase options from species config, filtered by current sex
const lifePhaseOptions = computed(() => {
  const phases = lifePhasesConfig.value
  if (!phases) {
    // Cattle fallback
    if (form.sex === 'male') return [{ code: 'calf' }, { code: 'young_bull' }, { code: 'bull' }]
    return [{ code: 'calf' }, { code: 'heifer' }, { code: 'cow' }]
  }
  return form.sex === 'male' ? (phases.male ?? []) : (phases.female ?? [])
})

// Reset life phase override when sex changes if current value is incompatible
watch(
  () => form.sex,
  () => {
    const allowed = new Set([null, ...lifePhaseOptions.value.map((p) => p.code)])
    if (!allowed.has(form.life_phase_override)) {
      form.life_phase_override = null
    }
  }
)

const apiError = ref('')
const saving = ref(false)

const statuses = ['active', 'dry', 'pregnant', 'sick', 'sold', 'dead']

onMounted(async () => {
  if (!breedTypesStore.hasData) breedTypesStore.fetchActive()

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
      })
    } catch {
      apiError.value = t('common.error')
    }
  } else if (isOffspringMode.value) {
    // Pre-fill from offspring birth event query params
    const q = route.query
    if (q.dob) form.dob = String(q.dob)
    if (q.dam_id) form.dam_id = String(q.dam_id)
    if (q.sire_id) form.sire_id = String(q.sire_id)
    if (q.breed_type_id) form.breed_type_id = q.breed_type_id
  } else if (fromCalving.value) {
    // Legacy pre-fill from old calving flow
    const q = route.query
    if (q.tag_number) form.tag_number = String(q.tag_number)
    if (q.sex) form.sex = String(q.sex)
    if (q.dob) form.dob = String(q.dob)
    if (q.dam_id) form.dam_id = String(q.dam_id)
    if (q.sire_id) form.sire_id = String(q.sire_id)
    if (q.breed_type_id) form.breed_type_id = q.breed_type_id
  }
})

function validate() {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.tag_number.trim()) errors.tag_number = t('animalForm.validationTag')
  if (!form.sex) errors.sex = t('animalForm.validationSex')
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
  if (payload.sex === 'female') {
    payload.is_external = false
    payload.purpose = null
  }
  // Link to birth event when in offspring mode
  if (isOffspringMode.value && route.query.birth_event_id) {
    payload.birth_event_id = String(route.query.birth_event_id)
  }

  try {
    if (isEdit.value) {
      await cowsStore.update(route.params.id, payload)
      router.replace(`/cows/${route.params.id}`)
    } else {
      const cow = await cowsStore.create(payload)

      if (isOffspringMode.value) {
        if (offspringAction.value === 'next' && !isLastOffspring.value) {
          // Advance to next offspring — same form, increment index
          const q = { ...route.query, offspring_index: String(offspringIndex.value + 1) }
          form.tag_number = ''
          form.name = ''
          form.sex = 'female'
          form.notes = ''
          form.life_phase_override = null
          await router.replace({ path: '/cows/new', query: q })
        } else {
          // Save & Done — navigate to dam detail
          const damId = route.query.dam_id
          router.replace(damId ? `/cows/${damId}` : '/cows')
        }
      } else {
        router.replace(`/cows/${cow.id}`)
      }
    }
  } catch (err) {
    apiError.value = resolveError(extractApiError(err), t)
  } finally {
    saving.value = false
  }
}

function handleSkipOffspring() {
  const damId = route.query.dam_id
  router.replace(damId ? `/cows/${damId}` : '/breed')
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

.offspring-banner {
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
  border-radius: var(--radius);
  padding: 10px 14px;
  margin-bottom: 16px;
}

.offspring-progress-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary);
  margin-bottom: 8px;
}

.offspring-progress-bar {
  height: 6px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.offspring-progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 4px;
  transition: width 0.3s ease;
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
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
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
