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
            @input="codeManuallyEdited = true; form.code = form.code.toUpperCase().replace(/[^A-Z0-9]/g, '')"
          />
          <p class="hint-text">{{ t('superAdmin.farmCodeHint') }}</p>
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

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import api from '../../services/api.js'
import AppHeader from '../../components/organisms/AppHeader.vue'
import { useToast } from '../../composables/useToast.js'

const { t } = useI18n()
const router = useRouter()
const { showToast } = useToast()

const form = ref({
  name: '',
  code: '',
  admin_username: '',
  admin_password: '',
  admin_full_name: '',
})

const saving = ref(false)
const errorMsg = ref('')
const codeManuallyEdited = ref(false)

function autoCode() {
  if (codeManuallyEdited.value) return
  form.value.code = form.value.name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10)
}

async function submit() {
  if (saving.value) return
  saving.value = true
  errorMsg.value = ''
  try {
    const { data } = await api.post('/farms', form.value)
    showToast(t('superAdmin.farmCreated'), 'success')
    router.push(`/super/farms/${data.farm.id}`)
  } catch (err) {
    errorMsg.value = err.response?.data?.error || t('common.error')
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
