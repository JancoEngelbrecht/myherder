import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api.js'
import db from '../db/indexedDB.js'
import { initialSync, isOfflineError } from '../services/syncManager.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(null)
  const user = ref(null)
  const hydrated = ref(false)
  const isOfflineMode = ref(false)

  const isAuthenticated = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const canManageCows = computed(() =>
    user.value?.role === 'admin' || (user.value?.permissions || []).includes('can_manage_cows')
  )

  async function hydrate() {
    if (hydrated.value) return
    try {
      const stored = await db.auth.get('session')
      if (stored?.token) {
        const payload = decodeToken(stored.token)
        if (!payload) {
          // Token expired — clear session
          await db.auth.delete('session')
          localStorage.removeItem('auth_token')
        } else {
          token.value = stored.token
          user.value = stored.user
          localStorage.setItem('auth_token', stored.token)
          // Auto-refresh if within 1 hour of expiry
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
    localStorage.setItem('auth_token', data.token)
    await db.auth.put({ key: 'session', token: data.token, user: data.user })
    // Trigger initial sync in background (don't block login)
    initialSync().catch(() => {})
  }

  /**
   * Decode JWT payload and check if token is still valid.
   * Returns the payload if valid, null if expired or invalid.
   */
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

  /**
   * Try to restore a cached session for offline use.
   * Returns true if a valid cached session was found.
   */
  async function tryOfflineLogin() {
    try {
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

  async function login(username, password) {
    try {
      const { data } = await api.post('/auth/login', { username, password })
      await setSession(data)
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

  async function loginPin(username, pin) {
    try {
      const { data } = await api.post('/auth/login-pin', { username, pin })
      await setSession(data)
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

  async function logout() {
    token.value = null
    user.value = null
    isOfflineMode.value = false
    localStorage.removeItem('auth_token')
    await db.auth.delete('session')
  }

  return {
    token, user, hydrated, isOfflineMode,
    isAuthenticated, isAdmin, canManageCows,
    hydrate, login, loginPin, logout,
  }
})
