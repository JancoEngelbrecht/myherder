import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../services/api.js'
import db from '../db/indexedDB.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(null)
  const user = ref(null)
  const hydrated = ref(false)

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
        token.value = stored.token
        user.value = stored.user
        localStorage.setItem('auth_token', stored.token)
      }
    } catch {
      // IndexedDB unavailable or no stored session
    } finally {
      hydrated.value = true
    }
  }

  async function setSession(data) {
    token.value = data.token
    user.value = data.user
    localStorage.setItem('auth_token', data.token)
    await db.auth.put({ key: 'session', token: data.token, user: data.user })
  }

  async function login(username, password) {
    const { data } = await api.post('/auth/login', { username, password })
    await setSession(data)
    return data
  }

  async function loginPin(username, pin) {
    const { data } = await api.post('/auth/login-pin', { username, pin })
    await setSession(data)
    return data
  }

  async function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('auth_token')
    await db.auth.delete('session')
  }

  return { token, user, hydrated, isAuthenticated, isAdmin, canManageCows, hydrate, login, loginPin, logout }
})
