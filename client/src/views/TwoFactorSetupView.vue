<template>
  <div class="twofa-page">
    <div class="twofa-hero">
      <div class="twofa-icon">🔐</div>
      <h1 class="twofa-title">{{ t('twoFactor.setupTitle') }}</h1>
      <p class="twofa-subtitle">{{ t('twoFactor.setupSubtitle') }}</p>
    </div>

    <div class="twofa-card">
      <!-- Step 1: QR Code -->
      <div v-if="step === 'qr'" class="setup-step">
        <div v-if="setupLoading" class="loading-box">
          <span class="spinner" style="width: 32px; height: 32px" />
        </div>

        <template v-else-if="setupData">
          <p class="step-label">{{ t('twoFactor.scanQR') }}</p>
          <div class="qr-container">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR Code" class="qr-image" />
          </div>

          <details class="manual-entry">
            <summary>{{ t('twoFactor.manualEntry') }}</summary>
            <code class="secret-code">{{ setupData.secret }}</code>
          </details>

          <button class="btn-primary" @click="step = 'confirm'">
            {{ t('common.next') }}
          </button>
        </template>

        <div v-if="setupError" class="error-box">{{ setupError }}</div>
      </div>

      <!-- Step 2: Confirm code -->
      <div v-if="step === 'confirm'" class="setup-step">
        <Transition name="fade">
          <div v-if="errorMsg" class="error-box">{{ errorMsg }}</div>
        </Transition>

        <form class="twofa-form" @submit.prevent="handleConfirm">
          <div class="form-group">
            <label class="form-label">{{ t('twoFactor.confirmCode') }}</label>
            <input
              v-model="code"
              type="text"
              class="form-input code-input"
              placeholder="000000"
              maxlength="6"
              autocomplete="one-time-code"
              inputmode="numeric"
              required
              autofocus
            />
          </div>

          <button type="submit" class="btn-primary" :disabled="loading || code.length < 6">
            <span
              v-if="loading"
              class="spinner"
              style="width: 18px; height: 18px; border-width: 2px"
            />
            <span v-else>{{ t('twoFactor.verify') }}</span>
          </button>
        </form>
      </div>

      <!-- Step 3: Recovery codes -->
      <div v-if="step === 'recovery'" class="setup-step">
        <p class="step-label warning-text">{{ t('twoFactor.saveCodesWarning') }}</p>

        <div class="recovery-grid">
          <code v-for="rc in setupData.recovery_codes" :key="rc" class="recovery-code">{{
            rc
          }}</code>
        </div>

        <button class="btn-primary" @click="handleContinue">
          {{ t('twoFactor.continue') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { extractApiError, resolveError } from '../utils/apiError'
import { useAuthStore } from '../stores/auth'
import QRCode from 'qrcode'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const step = ref('qr')
const setupData = ref(null)
const qrDataUrl = ref('')
const setupLoading = ref(true)
const setupError = ref('')
const code = ref('')
const loading = ref(false)
const errorMsg = ref('')

// Guard: must have temp token
if (!authStore.tempToken) {
  router.replace('/login')
}

onMounted(async () => {
  if (setupData.value) return // Prevent re-calling on re-mount
  try {
    setupData.value = await authStore.setup2fa()
    qrDataUrl.value = await QRCode.toDataURL(setupData.value.qr_uri, { width: 256 })
  } catch (err) {
    setupError.value = resolveError(extractApiError(err), t)
  } finally {
    setupLoading.value = false
  }
})

async function handleConfirm() {
  errorMsg.value = ''
  loading.value = true
  try {
    await authStore.confirm2fa(code.value.trim())
    step.value = 'recovery'
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

function handleContinue() {
  router.push('/')
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

.setup-step {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-label {
  font-size: 0.9375rem;
  color: var(--text-muted);
  text-align: center;
}

.loading-box {
  display: flex;
  justify-content: center;
  padding: 32px;
}

.qr-container {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.qr-image {
  width: 200px;
  height: 200px;
  border-radius: var(--radius);
  border: 2px solid var(--border);
}

.manual-entry {
  text-align: center;
  font-size: 0.875rem;
  color: var(--text-muted);
  cursor: pointer;
}

.manual-entry summary {
  font-weight: 600;
  color: var(--primary);
}

.secret-code {
  display: block;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  word-break: break-all;
  user-select: all;
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

.warning-text {
  color: var(--warning);
  font-weight: 600;
}

.recovery-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.recovery-code {
  padding: 8px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 0.875rem;
  text-align: center;
  font-weight: 600;
  user-select: all;
}
</style>
