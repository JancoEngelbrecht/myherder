<template>
  <div class="page">
    <AppHeader
      :title="isEdit ? t('cowForm.titleEdit') : t('cowForm.titleAdd')"
      :show-back="true"
      :back-to="isEdit ? `/cows/${route.params.id}` : '/cows'"
    />

    <div class="page-content">
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

        <!-- Breed -->
        <div class="form-group">
          <label class="form-label">{{ t('cowForm.breed') }}</label>
          <input
            v-model="form.breed"
            type="text"
            class="form-input"
            :placeholder="t('cowForm.breedPlaceholder')"
          />
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
        <div v-if="apiError" class="api-error">{{ apiError }}</div>

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
import AppHeader from '../components/organisms/AppHeader.vue'
import CowSearchDropdown from '../components/molecules/CowSearchDropdown.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const cowsStore = useCowsStore()

const isEdit = computed(() => !!route.params.id && route.path.endsWith('/edit'))

const form = reactive({
  tag_number: '',
  name: '',
  breed: '',
  dob: '',
  sex: 'female',
  status: 'active',
  notes: '',
  sire_id: null,
  dam_id: null,
})

const errors = reactive({})
const apiError = ref('')
const saving = ref(false)

const statuses = ['active', 'dry', 'pregnant', 'sick', 'sold', 'dead']

onMounted(async () => {
  if (isEdit.value) {
    try {
      const cow = await cowsStore.fetchOne(route.params.id)
      Object.assign(form, {
        tag_number: cow.tag_number || '',
        name: cow.name || '',
        breed: cow.breed || '',
        dob: cow.dob ? cow.dob.substring(0, 10) : '',
        sex: cow.sex || 'female',
        status: cow.status || 'active',
        notes: cow.notes || '',
        sire_id: cow.sire_id || null,
        dam_id: cow.dam_id || null,
      })
    } catch {
      apiError.value = t('common.error')
    }
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

  try {
    if (isEdit.value) {
      await cowsStore.update(route.params.id, payload)
      router.push(`/cows/${route.params.id}`)
    } else {
      const cow = await cowsStore.create(payload)
      router.push(`/cows/${cow.id}`)
    }
  } catch (err) {
    apiError.value = err.response?.data?.error || t('common.error')
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

.api-error {
  background: var(--danger-light);
  color: var(--danger);
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid rgba(214,40,40,0.2);
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
</style>
