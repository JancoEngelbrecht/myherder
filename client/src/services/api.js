import axios from 'axios'
import db, { closeDb } from '../db/indexedDB.js'
import { useToast } from '../composables/useToast.js'
import i18n from '../i18n/index.js'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// Request interceptor: inject token
api.interceptors.request.use((config) => {
  // Import lazily to avoid circular deps
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status

    if (status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('farm_id')
      localStorage.removeItem('farm_code')
      localStorage.removeItem('super_admin_token')
      localStorage.removeItem('active_farm_name')
      // Also clear IndexedDB so hydrate() won't restore the invalid session
      try { await db.auth.delete('session') } catch { /* ignore */ }
      closeDb()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }

    // 403 — show global toast for permission denied
    if (status === 403) {
      const { show } = useToast()
      show(i18n.global.t('errors.permissionDenied'), 'error')
    }

    return Promise.reject(error)
  }
)

export default api
