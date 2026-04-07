import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAuthStore } from '../stores/auth'
import api from '../services/api.js'

vi.mock('../services/api.js', () => ({
  default: {
    post: vi.fn(),
  },
}))

vi.mock('../db/indexedDB.js', () => ({
  default: {
    auth: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
  initDb: vi.fn().mockResolvedValue(undefined),
  closeDb: vi.fn(),
}))

// setup.js creates fresh Pinia before each test via setActivePinia(createPinia())
describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('isAuthenticated', () => {
    it('is false when no token is set', () => {
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(false)
    })

    it('is true when token is set', () => {
      const store = useAuthStore()
      store.token = 'abc123'
      expect(store.isAuthenticated).toBe(true)
    })
  })

  describe('isAdmin', () => {
    it('is false when user is null', () => {
      const store = useAuthStore()
      expect(store.isAdmin).toBe(false)
    })

    it('is true for admin role', () => {
      const store = useAuthStore()
      store.user = { role: 'admin', permissions: [] }
      expect(store.isAdmin).toBe(true)
    })

    it('is false for worker role', () => {
      const store = useAuthStore()
      store.user = { role: 'worker', permissions: [] }
      expect(store.isAdmin).toBe(false)
    })
  })

  describe('canManageAnimals', () => {
    it('is false when user is null', () => {
      const store = useAuthStore()
      expect(store.canManageAnimals).toBe(false)
    })

    it('is true for admin role regardless of permissions', () => {
      const store = useAuthStore()
      store.user = { role: 'admin', permissions: [] }
      expect(store.canManageAnimals).toBe(true)
    })

    it('is true for worker with can_manage_animals permission', () => {
      const store = useAuthStore()
      store.user = { role: 'worker', permissions: ['can_manage_animals'] }
      expect(store.canManageAnimals).toBe(true)
    })

    it('is false for worker without the permission', () => {
      const store = useAuthStore()
      store.user = { role: 'worker', permissions: ['can_view_reports'] }
      expect(store.canManageAnimals).toBe(false)
    })

    it('is false for worker with no permissions array', () => {
      const store = useAuthStore()
      store.user = { role: 'worker' }
      expect(store.canManageAnimals).toBe(false)
    })
  })

  describe('hasPermission', () => {
    it('returns true for admin regardless of permissions array', () => {
      const store = useAuthStore()
      store.user = { role: 'admin', permissions: [] }
      expect(store.hasPermission('can_record_milk')).toBe(true)
      expect(store.hasPermission('can_view_analytics')).toBe(true)
    })

    it('returns true for worker with the specific permission', () => {
      const store = useAuthStore()
      store.user = { role: 'worker', permissions: ['can_record_milk', 'can_log_issues'] }
      expect(store.hasPermission('can_record_milk')).toBe(true)
      expect(store.hasPermission('can_log_issues')).toBe(true)
    })

    it('returns false for worker without the permission', () => {
      const store = useAuthStore()
      store.user = { role: 'worker', permissions: ['can_record_milk'] }
      expect(store.hasPermission('can_view_analytics')).toBe(false)
    })

    it('returns false when user is null', () => {
      const store = useAuthStore()
      expect(store.hasPermission('can_record_milk')).toBe(false)
    })
  })

  describe('login', () => {
    it('sets token and user on the store after successful login', async () => {
      api.post.mockResolvedValue({
        data: { token: 'tok123', user: { role: 'admin', username: 'admin' } },
      })
      const store = useAuthStore()
      await store.login('admin', 'admin123')
      expect(store.token).toBe('tok123')
      expect(store.user.role).toBe('admin')
    })

    it('persists token to localStorage after login', async () => {
      api.post.mockResolvedValue({
        data: { token: 'tok123', user: { role: 'admin' } },
      })
      const store = useAuthStore()
      await store.login('admin', 'admin123')
      expect(localStorage.getItem('auth_token')).toBe('tok123')
    })
  })

  describe('logout', () => {
    it('clears token and user', async () => {
      const store = useAuthStore()
      store.token = 'abc'
      store.user = { role: 'admin' }
      await store.logout()
      expect(store.token).toBeNull()
      expect(store.user).toBeNull()
    })

    it('removes token from localStorage', async () => {
      const store = useAuthStore()
      localStorage.setItem('auth_token', 'abc')
      await store.logout()
      expect(localStorage.getItem('auth_token')).toBeNull()
    })
  })
})
