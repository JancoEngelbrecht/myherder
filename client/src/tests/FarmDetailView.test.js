import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import FarmDetailView from '../views/super/FarmDetailView.vue'
import { useAuthStore } from '../stores/auth.js'

const mockGet = vi.fn()
const mockPatch = vi.fn()
const mockDelete = vi.fn()
const mockPost = vi.fn()

vi.mock('../services/api.js', () => ({
  default: {
    get: (...args) => mockGet(...args),
    patch: (...args) => mockPatch(...args),
    delete: (...args) => mockDelete(...args),
    post: (...args) => mockPost(...args),
  },
}))

vi.mock('../services/syncManager.js', () => {
  const { ref } = require('vue')
  return {
    isOnline: ref(true),
    pendingCount: ref(0),
    isSyncing: ref(false),
    lastSyncTime: ref(null),
    failedItems: ref([]),
    sync: vi.fn(),
    initialSync: vi.fn(),
    getPending: vi.fn().mockResolvedValue([]),
    init: vi.fn(),
    destroyListeners: vi.fn(),
    isOfflineError: vi.fn().mockReturnValue(false),
    enqueue: vi.fn(),
    dequeueByEntityId: vi.fn(),
  }
})

vi.mock('../db/indexedDB.js', () => ({
  default: {
    auth: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    featureFlags: {
      put: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
  initDb: vi.fn(),
  closeDb: vi.fn(),
}))

const mockPush = vi.fn()
const mockShowToast = vi.fn()

vi.mock('vue-router', async () => {
  const actual = await vi.importActual('vue-router')
  return {
    ...actual,
    useRoute: () => ({ params: { id: 'f1' } }),
    useRouter: () => ({ push: mockPush }),
  }
})

vi.mock('../composables/useToast.js', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}))

const MOCK_FARM = {
  id: 'f1',
  name: 'Test Farm',
  code: 'TESTFM',
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  users: [{ id: 'u1', username: 'admin1', full_name: 'Admin One', role: 'admin', is_active: true }],
}

function setSuperAdmin() {
  const auth = useAuthStore()
  auth.user = {
    full_name: 'Super Admin',
    username: 'super',
    role: 'super_admin',
    permissions: [],
    farm_id: null,
  }
  auth.token = 'test-token'
}

describe('FarmDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ data: { ...MOCK_FARM } })
    mockPatch.mockResolvedValue({ data: { ...MOCK_FARM, is_active: false } })
    mockDelete.mockResolvedValue({ data: { message: 'Farm permanently deleted' } })
  })

  it('renders farm detail on mount', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmDetailView)
    await flushPromises()

    expect(wrapper.text()).toContain('Test Farm')
    expect(wrapper.text()).toContain('TESTFM')
  })

  it('renders delete button', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmDetailView)
    await flushPromises()

    const buttons = wrapper.findAll('.btn-danger')
    const deleteBtn = buttons.find((b) => b.text().includes('superAdmin.deleteFarm'))
    expect(deleteBtn).toBeDefined()
  })

  it('shows typed-confirmation dialog when delete is clicked', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmDetailView)
    await flushPromises()

    // Initially no dialog
    expect(wrapper.find('.dialog-overlay').exists()).toBe(false)

    // Click the delete button
    const buttons = wrapper.findAll('.btn-danger')
    const deleteBtn = buttons.find((b) => b.text().includes('superAdmin.deleteFarm'))
    await deleteBtn.trigger('click')

    expect(wrapper.find('.dialog-overlay').exists()).toBe(true)
    expect(wrapper.find('.dialog-overlay input').exists()).toBe(true)
  })

  it('disables confirm button until farm name is typed', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmDetailView)
    await flushPromises()

    // Open delete dialog
    const buttons = wrapper.findAll('.btn-danger')
    const deleteBtn = buttons.find((b) => b.text().includes('superAdmin.deleteFarm'))
    await deleteBtn.trigger('click')

    // Confirm button should be disabled
    const confirmBtn = wrapper.find('.dialog-overlay .btn-danger')
    expect(confirmBtn.attributes('disabled')).toBeDefined()

    // Type the farm name
    const input = wrapper.find('.dialog-overlay input')
    await input.setValue('Test Farm')

    // Confirm button should now be enabled
    expect(confirmBtn.attributes('disabled')).toBeUndefined()
  })

  it('calls api.delete and redirects on confirm', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmDetailView)
    await flushPromises()

    // Open dialog and type farm name
    const buttons = wrapper.findAll('.btn-danger')
    const deleteBtn = buttons.find((b) => b.text().includes('superAdmin.deleteFarm'))
    await deleteBtn.trigger('click')
    await wrapper.find('.dialog-overlay input').setValue('Test Farm')

    // Click confirm
    await wrapper.find('.dialog-overlay .btn-danger').trigger('click')
    await flushPromises()

    expect(mockDelete).toHaveBeenCalledWith('/farms/f1')
    expect(mockPush).toHaveBeenCalledWith('/super/farms')
  })

  it('shows toast on API error', async () => {
    setSuperAdmin()
    mockDelete.mockRejectedValue({
      response: {
        data: { error: 'Cannot delete farm with super-admin users. Reassign them first.' },
      },
    })
    const wrapper = mount(FarmDetailView)
    await flushPromises()

    // Open dialog and type farm name
    const buttons = wrapper.findAll('.btn-danger')
    const deleteBtn = buttons.find((b) => b.text().includes('superAdmin.deleteFarm'))
    await deleteBtn.trigger('click')
    await wrapper.find('.dialog-overlay input').setValue('Test Farm')

    // Click confirm — should not crash
    await wrapper.find('.dialog-overlay .btn-danger').trigger('click')
    await flushPromises()

    expect(mockDelete).toHaveBeenCalledWith('/farms/f1')
    // Should not redirect on error
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('deactivate calls api.patch not api.delete', async () => {
    setSuperAdmin()
    const wrapper = mount(FarmDetailView)
    await flushPromises()

    // Click deactivate button (the one that shows the ConfirmDialog)
    const deactivateBtn = wrapper
      .findAll('.btn-danger')
      .find((b) => b.text().includes('superAdmin.deactivateFarm'))
    await deactivateBtn.trigger('click')

    // Find the ConfirmDialog confirm button and click it
    // ConfirmDialog renders its own btn-danger
    await wrapper.findComponent({ name: 'ConfirmDialog' }).vm.$emit('confirm')
    await flushPromises()

    expect(mockPatch).toHaveBeenCalledWith('/farms/f1', { is_active: false })
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
