<template>
  <div class="page">
    <AppHeader :title="t('superAdmin.createFarm')" show-back back-to="/super/farms" />

    <div class="page-content">
      <form class="card form-card" @submit.prevent="submit">
        <div class="form-group">
          <label for="cf-name">{{ t('superAdmin.farmName') }} *</label>
          <input
            id="cf-name"
            v-model="form.name"
            class="form-input"
            required
            maxlength="100"
            :placeholder="t('superAdmin.farmNamePlaceholder')"
            @input="autoCode"
          />
        </div>

        <div class="form-group">
          <label for="cf-code">{{ t('superAdmin.farmCode') }} *</label>
          <input
            id="cf-code"
            v-model="form.code"
            class="form-input mono"
            required
            maxlength="10"
            :placeholder="t('superAdmin.farmCodePlaceholder')"
            @input="onCodeInput"
          />
          <p class="hint-text">{{ t('superAdmin.farmCodeHint') }}</p>
        </div>

        <div class="form-group">
          <label for="cf-species">{{ t('superAdmin.speciesLabel') }} *</label>
          <select id="cf-species" v-model="form.species_code" class="form-input" required>
            <option v-if="loadingSpecies" value="" disabled>{{ t('common.loading') }}</option>
            <option v-for="sp in species" :key="sp.code" :value="sp.code">
              {{ sp.name }}
            </option>
          </select>
          <p class="hint-text">{{ t('superAdmin.speciesHint') }}</p>
        </div>

        <hr class="form-divider" />

        <h3 class="form-section-title">{{ t('superAdmin.farmAdmin') }}</h3>

        <div class="form-group">
          <label for="cf-username">{{ t('superAdmin.adminUsername') }} *</label>
          <input
            id="cf-username"
            v-model="form.admin_username"
            class="form-input"
            required
            maxlength="50"
          />
        </div>

        <div class="form-group">
          <label for="cf-fullname">{{ t('superAdmin.adminFullName') }} *</label>
          <input
            id="cf-fullname"
            v-model="form.admin_full_name"
            class="form-input"
            required
            maxlength="100"
          />
        </div>

        <div class="form-group">
          <label for="cf-password">{{ t('superAdmin.adminPassword') }} *</label>
          <input
            id="cf-password"
            v-model="form.admin_password"
            class="form-input"
            type="password"
            required
            minlength="6"
            maxlength="128"
          />
        </div>

        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? t('common.saving') : t('superAdmin.createFarm') }}
        </button>

        <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import api from '../../services/api'
import AppHeader from '../../components/organisms/AppHeader.vue'
import { useToast } from '../../composables/useToast'

const { t } = useI18n()
const router = useRouter()
const { showToast } = useToast()

const species = ref([])
const loadingSpecies = ref(true)

const form = ref({
  name: '',
  code: '',
  species_code: 'cattle',
  admin_username: '',
  admin_password: '',
  admin_full_name: '',
})

const saving = ref(false)
const errorMsg = ref('')
const codeManuallyEdited = ref(false)

function onCodeInput() {
  codeManuallyEdited.value = true
  form.value.code = form.value.code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function autoCode() {
  if (codeManuallyEdited.value) return
  form.value.code = form.value.name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10)
}

onMounted(async () => {
  try {
    const { data } = await api.get('/species')
    species.value = data
  } catch {
    // Fall back to hardcoded options if species endpoint fails
    species.value = [
      { code: 'cattle', name: 'Cattle' },
      { code: 'sheep', name: 'Sheep' },
    ]
  } finally {
    loadingSpecies.value = false
  }
})

async function submit() {
  if (saving.value) return
  saving.value = true
  errorMsg.value = ''
  try {
    const { data } = await api.post('/farms', form.value, { timeout: 30000 })
    showToast(t('superAdmin.farmCreated'), 'success')
    router.push(`/super/farms/${data.farm.id}`)
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      errorMsg.value = t('superAdmin.errorTimeout')
    } else if (!err.response) {
      errorMsg.value = t('superAdmin.errorNetwork')
    } else if (typeof err.response.data !== 'object' || !err.response.data?.error) {
      errorMsg.value = t('superAdmin.errorServer')
    } else {
      errorMsg.value = err.response.data.error
    }
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.form-card {
  padding: 20px;
}

.form-divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 16px 0;
}

.form-section-title {
  font-size: 0.9375rem;
  font-weight: 700;
  margin: 0 0 12px;
}

.hint-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.error-text {
  color: var(--danger);
  font-size: 0.8125rem;
  margin-top: 8px;
}
</style>
