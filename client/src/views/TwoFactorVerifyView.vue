<template>
  <div class="twofa-page">
    <div class="twofa-hero">
      <div class="twofa-icon">🔐</div>
      <h1 class="twofa-title">{{ t('twoFactor.title') }}</h1>
      <p class="twofa-subtitle">{{ t('twoFactor.subtitle') }}</p>
    </div>

    <div class="twofa-card">
      <Transition name="fade">
        <div v-if="errorMsg" class="error-box">{{ errorMsg }}</div>
      </Transition>

      <form class="twofa-form" @submit.prevent="handleVerify">
        <div class="form-group">
          <label class="form-label">
            {{ useRecovery ? t('twoFactor.enterRecoveryCode') : t('twoFactor.enterCode') }}
          </label>
          <input
            v-model="code"
            type="text"
            class="form-input code-input"
            :placeholder="useRecovery ? 'ABCD1234' : '000000'"
            :maxlength="useRecovery ? 20 : 6"
            autocomplete="one-time-code"
            :inputmode="useRecovery ? 'text' : 'numeric'"
            required
            autofocus
          />
        </div>

        <button type="submit" class="btn-primary" :disabled="loading || !code.trim()">
          <span
            v-if="loading"
            class="spinner"
            style="width: 18px; height: 18px; border-width: 2px"
          />
          <span v-else>{{ t('twoFactor.verify') }}</span>
        </button>
      </form>

      <button class="toggle-link" @click="toggleMode">
        {{ useRecovery ? t('twoFactor.useAuthenticator') : t('twoFactor.useRecoveryCode') }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth.js'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const code = ref('')
const loading = ref(false)
const errorMsg = ref('')
const useRecovery = ref(false)

// Guard: must have temp token
if (!authStore.tempToken) {
  router.replace('/login')
}

function toggleMode() {
  useRecovery.value = !useRecovery.value
  code.value = ''
  errorMsg.value = ''
}

async function handleVerify() {
  errorMsg.value = ''
  loading.value = true
  try {
    await authStore.verify2fa(code.value.trim())
    router.push('/')
  } catch (err) {
    const status = err.response?.status
    if (status === 401) {
      errorMsg.value = t('twoFactor.invalidCode')
    } else {
      errorMsg.value = t('login.errorNetwork')
    }
    code.value = ''
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.twofa-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(
    160deg,
    var(--primary-dark) 0%,
    var(--primary) 45%,
    var(--primary-light) 100%
  );
}

.twofa-hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px 24px;
  text-align: center;
}

.twofa-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.twofa-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
}

.twofa-subtitle {
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 4px;
}

.twofa-card {
  background: var(--bg);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  padding: 24px 20px 32px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
}

.twofa-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.code-input {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 1.5rem;
  letter-spacing: 0.3em;
  font-weight: 700;
}

.toggle-link {
  display: block;
  margin: 16px auto 0;
  background: none;
  border: none;
  color: var(--primary);
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
</style>
