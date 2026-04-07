<template>
  <div class="login-page">
    <div class="login-hero">
      <div class="login-logo">🐄</div>
      <h1 class="login-title">{{ t('login.title') }}</h1>
      <p class="login-subtitle">{{ t('login.superAdminSubtitle') }}</p>
    </div>

    <div class="login-card">
      <h2 class="sa-heading">{{ t('login.superAdminTitle') }}</h2>

      <!-- Error banner -->
      <Transition name="fade">
        <div v-if="errorMsg" class="error-box">
          {{ errorMsg }}
        </div>
      </Transition>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label class="form-label">{{ t('login.username') }}</label>
          <input
            v-model="form.username"
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
            v-model="form.password"
            type="password"
            class="form-input"
            :placeholder="t('login.passwordPlaceholder')"
            autocomplete="current-password"
            required
          />
        </div>

        <button type="submit" class="btn-primary" :disabled="loading">
          <span
            v-if="loading"
            class="spinner"
            style="width: 18px; height: 18px; border-width: 2px"
          />
          <span v-else>{{ t('login.loginBtn') }}</span>
        </button>
      </form>

      <!-- Back to farm login -->
      <div class="back-row">
        <router-link to="/login" class="back-link">
          &larr; {{ t('login.backToFarmLogin') }}
        </router-link>
      </div>

      <!-- Language toggle -->
      <div class="lang-row">
        <button class="lang-btn" :class="{ active: locale === 'en' }" @click="setLocale('en')">
          EN
        </button>
        <span class="lang-divider">|</span>
        <button class="lang-btn" :class="{ active: locale === 'af' }" @click="setLocale('af')">
          AF
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'

const { t, locale } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const loading = ref(false)
const errorMsg = ref('')
const form = reactive({ username: '', password: '' })

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

async function handleLogin() {
  errorMsg.value = ''
  loading.value = true
  try {
    const data = await authStore.login(form.username, form.password)

    if (data.requires_totp_setup) {
      router.push('/auth/setup-2fa')
      return
    }
    if (data.requires_2fa) {
      router.push('/auth/2fa')
      return
    }

    router.push('/')
  } catch (err) {
    errorMsg.value = getErrorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #1a1a2e 0%, #16213e 45%, #0f3460 100%);
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
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2));
}

.login-title {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
}

.login-subtitle {
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 4px;
}

.login-card {
  background: var(--bg);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  padding: 24px 20px 32px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
}

.sa-heading {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text);
  text-align: center;
  margin-bottom: 20px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.back-row {
  text-align: center;
  margin-top: 20px;
}

.back-link {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary);
  text-decoration: none;
}

.back-link:hover {
  text-decoration: underline;
}

/* Language row */
.lang-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
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
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
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
