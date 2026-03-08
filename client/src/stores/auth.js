import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api.js'
import db, { initDb, closeDb } from '../db/indexedDB.js'
import { initialSync, isOfflineError } from '../services/syncManager.js'
import { useFeatureFlagsStore } from './featureFlags.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(null)
  const user = ref(null)
  const hydrated = ref(false)
  const isOfflineMode = ref(false)
  const tempToken = ref(null)
  const pending2fa = ref(false)
  const pending2faSetup = ref(false)

  const storedFarmName = localStorage.getItem('active_farm_name')
  const activeFarmName = ref(storedFarmName !== null && storedFarmName !== '' ? storedFarmName : null)

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'super_admin')
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')
  const isInFarmContext = computed(() => isSuperAdmin.value && activeFarmName.value !== null)

  function hasPermission(perm) {
    if (user.value?.role === 'admin' || user.value?.role === 'super_admin') return true
    return (user.value?.permissions || []).includes(perm)
  }

  const canManageCows = computed(() => hasPermission('can_manage_cows'))

  async function hydrate() {
    if (hydrated.value) return
    try {
      // Initialize farm-scoped DB before reading session
      const storedFarmId = localStorage.getItem('farm_id')
      await initDb(storedFarmId || null)
      const stored = await db.auth.get('session')
      if (stored?.token) {
        const payload = decodeToken(stored.token)
        if (!payload) {
          await db.auth.delete('session')
          localStorage.removeItem('auth_token')
        } else {
          token.value = stored.token
          user.value = stored.user
          localStorage.setItem('auth_token', stored.token)
          if (payload.exp) {
            const msUntilExpiry = payload.exp * 1000 - Date.now()
            if (msUntilExpiry < 60 * 60 * 1000) {
              refreshToken().catch(() => {})
            }
          }
        }
      }
    } catch {
      // IndexedDB unavailable or no stored session
    } finally {
      hydrated.value = true
    }
  }

  async function refreshToken() {
    try {
      const { data } = await api.post('/auth/refresh')
      token.value = data.token
      user.value = data.user
      localStorage.setItem('auth_token', data.token)
      await db.auth.put({ key: 'session', token: data.token, user: data.user })
    } catch {
      // Offline or failed — continue with current token
    }
  }

  async function setSession(data) {
    token.value = data.token
    user.value = data.user
    isOfflineMode.value = false
    tempToken.value = null
    pending2fa.value = false
    pending2faSetup.value = false
    localStorage.setItem('auth_token', data.token)
    if (data.user?.farm_id) {
      localStorage.setItem('farm_id', data.user.farm_id)
    }
    // Initialize farm-scoped IndexedDB before any DB writes
    await initDb(data.user?.farm_id)
    await db.auth.put({ key: 'session', token: data.token, user: data.user })
    // Super-admin without farm context — skip farm-scoped fetches
    if (data.user?.role === 'super_admin' && !data.user?.farm_id) return
    const featureFlagsStore = useFeatureFlagsStore()
    featureFlagsStore.fetchFlags().catch(() => {})
    initialSync().catch(() => {})
    // Eagerly fetch cows after login
    const { useCowsStore } = await import('./cows.js')
    const cowsStore = useCowsStore()
    cowsStore.fetchAll().catch(() => {})
  }

  function decodeToken(jwt) {
    try {
      const parts = jwt.split('.')
      if (parts.length !== 3) return null
      const payload = JSON.parse(atob(parts[1]))
      if (payload.exp && payload.exp * 1000 < Date.now()) return null
      return payload
    } catch {
      return null
    }
  }

  async function tryOfflineLogin() {
    try {
      // Ensure farm-scoped DB is initialized for offline reads
      const storedFarmId = localStorage.getItem('farm_id')
      await initDb(storedFarmId || null)

      const stored = await db.auth.get('session')
      if (!stored?.token) return false

      const payload = decodeToken(stored.token)
      if (!payload) return false

      token.value = stored.token
      user.value = stored.user
      isOfflineMode.value = true
      localStorage.setItem('auth_token', stored.token)
      return true
    } catch {
      return false
    }
  }

  async function login(username, password, farmCode) {
    try {
      const body = { username, password }
      if (farmCode) body.farm_code = farmCode

      const { data } = await api.post('/auth/login', body)

      // 2FA flows
      if (data.requires_totp_setup) {
        tempToken.value = data.temp_token
        pending2faSetup.value = true
        if (farmCode) localStorage.setItem('farm_code', farmCode)
        return data
      }
      if (data.requires_2fa) {
        tempToken.value = data.temp_token
        pending2fa.value = true
        if (farmCode) localStorage.setItem('farm_code', farmCode)
        return data
      }

      await setSession(data)
      if (farmCode) localStorage.setItem('farm_code', farmCode)
      return data
    } catch (err) {
      if (isOfflineError(err)) {
        const offlineOk = await tryOfflineLogin()
        if (offlineOk) return { token: token.value, user: user.value }
        throw new Error('offline-no-session')
      }
      throw err
    }
  }

  async function loginPin(username, pin, farmCode) {
    try {
      const { data } = await api.post('/auth/login-pin', {
        username,
        pin,
        farm_code: farmCode,
      })
      await setSession(data)
      if (farmCode) localStorage.setItem('farm_code', farmCode)
      return data
    } catch (err) {
      if (isOfflineError(err)) {
        const offlineOk = await tryOfflineLogin()
        if (offlineOk) return { token: token.value, user: user.value }
        throw new Error('offline-no-session')
      }
      throw err
    }
  }

  async function setup2fa() {
    const { data } = await api.post('/auth/setup-2fa', null, {
      headers: { Authorization: `Bearer ${tempToken.value}` },
    })
    return data
  }

  async function confirm2fa(code) {
    const { data } = await api.post('/auth/confirm-2fa', { code }, {
      headers: { Authorization: `Bearer ${tempToken.value}` },
    })
    await setSession(data)
    return data
  }

  async function verify2fa(code) {
    const { data } = await api.post('/auth/verify-2fa', { code }, {
      headers: { Authorization: `Bearer ${tempToken.value}` },
    })
    await setSession(data)
    return data
  }

  async function enterFarm(farmId) {
    // Guard against double-entering — exit current farm context first
    if (localStorage.getItem('super_admin_token')) {
      await exitFarm()
    }
    // Save current super-admin token before switching context
    localStorage.setItem('super_admin_token', token.value)
    const { data } = await api.post(`/farms/${farmId}/enter`)
    activeFarmName.value = data.farm?.name || 'Farm'
    localStorage.setItem('active_farm_name', activeFarmName.value)
    await setSession(data)
  }

  async function exitFarm() {
    const superToken = localStorage.getItem('super_admin_token')
    if (!superToken) return

    localStorage.removeItem('super_admin_token')
    localStorage.removeItem('active_farm_name')
    activeFarmName.value = null

    // Decode the original super-admin token to restore user data
    const payload = decodeToken(superToken)
    if (!payload) {
      // Super-admin token expired — full logout
      await logout()
      return
    }

    const userData = {
      id: payload.id,
      farm_id: payload.farm_id || null,
      username: payload.username,
      full_name: payload.full_name,
      role: payload.role,
      permissions: payload.permissions || [],
      language: payload.language,
      token_version: payload.token_version ?? 0,
    }

    token.value = superToken
    user.value = userData
    localStorage.setItem('auth_token', superToken)
    localStorage.removeItem('farm_id')
    localStorage.removeItem('farm_code')

    // Close farm-scoped DB and re-init without farm context
    try { await db.auth.delete('session') } catch { /* may be closed */ }
    await closeDb()
    await initDb(null)
    await db.auth.put({ key: 'session', token: superToken, user: userData })
  }

  async function logout() {
    token.value = null
    user.value = null
    isOfflineMode.value = false
    tempToken.value = null
    pending2fa.value = false
    pending2faSetup.value = false
    activeFarmName.value = null
    localStorage.removeItem('auth_token')
    localStorage.removeItem('farm_id')
    localStorage.removeItem('farm_code')
    localStorage.removeItem('super_admin_token')
    localStorage.removeItem('active_farm_name')
    try {
      await db.auth.delete('session')
    } catch {
      // DB may already be closed
    }
    await closeDb()
  }

  return {
    token, user, hydrated, isOfflineMode,
    tempToken, pending2fa, pending2faSetup,
    activeFarmName,
    isAuthenticated, isAdmin, isSuperAdmin, isInFarmContext, canManageCows, hasPermission,
    hydrate, login, loginPin, logout, setSession,
    setup2fa, confirm2fa, verify2fa,
    enterFarm, exitFarm,
  }
})
