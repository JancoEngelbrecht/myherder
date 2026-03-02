<template>
  <div class="login-page">
    <div class="login-hero">
      <div class="login-logo">🐄</div>
      <h1 class="login-title">{{ t('login.title') }}</h1>
      <p v-if="farmName" class="login-farm-name">{{ farmName }}</p>
      <p class="login-subtitle">{{ t('login.subtitle') }}</p>
    </div>

    <div class="login-card">
      <!-- Tab switcher -->
      <div class="login-tabs">
        <button
          class="login-tab"
          :class="{ active: activeTab === 'admin' }"
          @click="activeTab = 'admin'"
        >
          {{ t('login.tabAdmin') }}
        </button>
        <button
          class="login-tab"
          :class="{ active: activeTab === 'worker' }"
          @click="activeTab = 'worker'"
        >
          {{ t('login.tabWorker') }}
        </button>
      </div>

      <!-- Error banner -->
      <Transition name="fade">
        <div v-if="errorMsg" class="error-box">
          {{ errorMsg }}
        </div>
      </Transition>

      <!-- Admin tab -->
      <form v-if="activeTab === 'admin'" class="login-form" @submit.prevent="handleAdminLogin">
        <div class="form-group">
          <label class="form-label">{{ t('login.username') }}</label>
          <input
            v-model="adminForm.username"
            type="text"
            class="form-input"
            :placeholder="t('login.usernamePlaceholder')"
            autocomplete="username"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label">{{ t('login.password') }}</label>
          <input
            v-model="adminForm.password"
            type="password"
            class="form-input"
            :placeholder="t('login.passwordPlaceholder')"
            autocomplete="current-password"
            required
          />
        </div>

        <button type="submit" class="btn-primary" :disabled="loading">
          <span v-if="loading" class="spinner" style="width:18px;height:18px;border-width:2px" />
          <span v-else>{{ t('login.loginBtn') }}</span>
        </button>
      </form>

      <!-- Worker tab (PIN) -->
      <form v-else class="login-form" @submit.prevent="handlePinLogin">
        <div class="form-group">
          <label class="form-label">{{ t('login.username') }}</label>
          <input
            v-model="workerForm.username"
            type="text"
            class="form-input"
            :placeholder="t('login.usernamePlaceholder')"
            autocomplete="username"
            required
          />
        </div>

        <!-- PIN Keypad -->
        <div class="form-group">
          <label class="form-label">{{ t('login.pin') }}</label>
          <div class="pin-display">
            <span v-for="i in 4" :key="i" class="pin-dot" :class="{ filled: workerForm.pin.length >= i }" />
          </div>
        </div>

        <div class="pin-keypad">
          <button
            v-for="key in keypadKeys"
            :key="key"
            type="button"
            class="pin-key"
            :class="{ wide: key === '0' }"
            @click="handlePinKey(key)"
          >
            {{ key === 'del' ? '⌫' : key }}
          </button>
        </div>

        <button type="submit" class="btn-primary" :disabled="loading || workerForm.pin.length < 4">
          <span v-if="loading" class="spinner" style="width:18px;height:18px;border-width:2px" />
          <span v-else>{{ t('login.loginBtn') }}</span>
        </button>
      </form>

      <!-- Language toggle -->
      <div class="lang-row">
        <button class="lang-btn" :class="{ active: locale === 'en' }" @click="setLocale('en')">EN</button>
        <span class="lang-divider">|</span>
        <button class="lang-btn" :class="{ active: locale === 'af' }" @click="setLocale('af')">AF</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth.js'
import { useCowsStore } from '../stores/cows.js'
import api from '../services/api.js'

const { t, locale } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const cowsStore = useCowsStore()

const activeTab = ref('admin')
const farmName = ref('')

onMounted(async () => {
  try {
    const { data } = await api.get('/settings')
    farmName.value = data.farm_name || ''
  } catch {
    // Silently ignore — farm name on login is optional
  }
})
const loading = ref(false)
const errorMsg = ref('')

const adminForm = reactive({ username: '', password: '' })
const workerForm = reactive({ username: '', pin: '' })

const keypadKeys = ['1','2','3','4','5','6','7','8','9','del','0']

function handlePinKey(key) {
  if (key === 'del') {
    workerForm.pin = workerForm.pin.slice(0, -1)
  } else if (workerForm.pin.length < 4) {
    workerForm.pin += key
  }
}

function setLocale(lang) {
  locale.value = lang
  localStorage.setItem('locale', lang)
}

function getErrorMessage(err) {
  if (err.message === 'offline-no-session') return t('sync.cannotLogin')
  const status = err.response?.status
  if (status === 423) return t('login.errorLocked')
  if (status === 401 || status === 400) return t('login.errorInvalid')
  return t('login.errorNetwork')
}

async function handleLogin(loginFn, onError) {
  errorMsg.value = ''
  loading.value = true
  try {
    await loginFn()
    await cowsStore.fetchAll()
    router.push('/')
  } catch (err) {
    errorMsg.value = getErrorMessage(err)
    onError?.()
  } finally {
    loading.value = false
  }
}

function handleAdminLogin() {
  handleLogin(() => authStore.login(adminForm.username, adminForm.password))
}

function handlePinLogin() {
  handleLogin(
    () => authStore.loginPin(workerForm.username, workerForm.pin),
    () => { workerForm.pin = '' }
  )
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, var(--primary-dark) 0%, var(--primary) 45%, var(--primary-light) 100%);
}

.login-hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px 24px;
  text-align: center;
}

.login-logo {
  font-size: 4rem;
  margin-bottom: 12px;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.2));
}

.login-title {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
}

.login-farm-name {
  font-size: 1rem;
  color: rgba(255,255,255,0.9);
  font-weight: 500;
  margin-top: 4px;
}

.login-subtitle {
  font-size: 0.9375rem;
  color: rgba(255,255,255,0.75);
  margin-top: 4px;
}

.login-card {
  background: var(--bg);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  padding: 24px 20px 32px;
  box-shadow: 0 -8px 32px rgba(0,0,0,0.12);
}

.login-tabs {
  display: flex;
  background: var(--surface-2);
  border-radius: var(--radius);
  padding: 4px;
  margin-bottom: 20px;
  border: 1px solid var(--border);
}

.login-tab {
  flex: 1;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.login-tab.active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}


/* PIN display */
.pin-display {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 12px 0;
}

.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  background: transparent;
  transition: background 0.15s, border-color 0.15s;
}

.pin-dot.filled {
  background: var(--primary);
  border-color: var(--primary);
}

/* PIN keypad */
.pin-keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 4px;
}

.pin-key {
  padding: 14px;
  border-radius: var(--radius);
  border: 1.5px solid var(--border);
  background: var(--surface);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  transition: background 0.1s, transform 0.1s;
  font-family: var(--font-mono);
}

.pin-key:active {
  background: var(--primary-bg);
  transform: scale(0.94);
}

/* Language row */
.lang-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
}

.lang-btn {
  padding: 4px 12px;
  border-radius: var(--radius-full);
  border: 1.5px solid var(--border);
  background: transparent;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.lang-btn.active {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.lang-divider {
  color: var(--border-strong);
}
</style>
