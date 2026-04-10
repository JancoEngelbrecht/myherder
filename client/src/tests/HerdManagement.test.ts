import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HerdManagement from '../views/admin/HerdManagement.vue'

// ── Route mock ───────────────────────────────────────────────

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useRoute: () => ({ params: {}, query: {}, path: '/' }),
  createRouter: vi.fn(),
  createMemoryHistory: vi.fn(),
}))

// ── API mock ─────────────────────────────────────────────────

const { mockApi } = vi.hoisted(() => ({
  mockApi: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../services/api', () => ({ default: mockApi }))

// ── Sync manager mock ─────────────────────────────────────────

vi.mock('../services/syncManager', () => {
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

// ── IndexedDB mock ────────────────────────────────────────────

vi.mock('../db/indexedDB', () => ({
  default: {
    animals: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    breedTypes: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      count: vi.fn().mockResolvedValue(0),
      bulkDelete: vi.fn(),
    },
  },
}))

// ── Fixtures ──────────────────────────────────────────────────

const MOCK_ANIMALS = [
  { id: 'a1', tag_number: 'T-001', name: 'Bessie', sex: 'female', status: 'active' },
  { id: 'a2', tag_number: 'T-002', name: 'Daisy', sex: 'female', status: 'active' },
  { id: 'a3', tag_number: 'T-003', name: 'Bull', sex: 'male', status: 'active' },
]

const MOCK_BREED_TYPES = [
  { id: 'bt1', code: 'holstein', name: 'Holstein', is_active: true, sort_order: 0 },
]

// Stub ConfirmDialog with named component so findComponent works
const ConfirmDialogStub = {
  name: 'ConfirmDialog',
  template:
    '<div class="confirm-dialog" :data-show="show"><button class="confirm-btn" @click="$emit(\'confirm\')" /><button class="cancel-btn" @click="$emit(\'cancel\')" /></div>',
  props: ['show', 'message', 'confirmLabel', 'cancelLabel', 'loading'],
  emits: ['confirm', 'cancel'],
}

const stubs = {
  AppHeader: { template: '<div class="app-header" />' },
  ConfirmDialog: ConfirmDialogStub,
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: true,
  AppIcon: true,
}

function mountComponent() {
  return mount(HerdManagement, {
    global: { stubs },
  })
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())

  mockApi.get.mockImplementation((url: string) => {
    if (url === '/breed-types') {
      return Promise.resolve({ data: MOCK_BREED_TYPES })
    }
    if (url === '/animals') {
      return Promise.resolve({
        data: MOCK_ANIMALS,
        headers: { 'x-total-count': '3' },
      })
    }
    return Promise.resolve({ data: [], headers: {} })
  })
})

// ═══════════════════════════════════════════════════════════════
// Batch Create
// ═══════════════════════════════════════════════════════════════

describe('HerdManagement — batch create', () => {
  it('submits batchCreate with correct payload when tags are entered', async () => {
    mockApi.post.mockResolvedValue({
      data: {
        animals: [
          { id: 'new-1', tag_number: 'N-001', sex: 'female', status: 'active' },
          { id: 'new-2', tag_number: 'N-002', sex: 'female', status: 'active' },
        ],
        count: 2,
      },
    })

    const wrapper = mountComponent()
    await flushPromises()

    // Enter tags in the textarea
    await wrapper.find('textarea').setValue('N-001, N-002')
    await wrapper.vm.$nextTick()

    // Submit
    await wrapper.find('.create-btn').trigger('click')
    await flushPromises()

    expect(mockApi.post).toHaveBeenCalledWith(
      '/animals/batch',
      expect.objectContaining({
        tags: ['N-001', 'N-002'],
        defaults: expect.objectContaining({ sex: 'female', status: 'active' }),
      })
    )
  })

  it('shows duplicate chip class and disables submit when tags have duplicates', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('textarea').setValue('T-001, T-001, T-002')
    await wrapper.vm.$nextTick()

    // Duplicate chips should have error class
    const dupChips = wrapper.findAll('.chip-duplicate')
    expect(dupChips.length).toBeGreaterThan(0)
    expect(dupChips[0].text()).toBe('T-001')

    // Submit must be disabled
    const submitBtn = wrapper.find('.create-btn')
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('disables submit when textarea is empty', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const submitBtn = wrapper.find('.create-btn')
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════
// Bulk Delete
// ═══════════════════════════════════════════════════════════════

describe('HerdManagement — bulk delete', () => {
  it('renders animal list on mount', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const rows = wrapper.findAll('.animal-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('T-001')
  })

  it('selecting two rows shows the delete bar', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const rows = wrapper.findAll('.animal-row')
    await rows[0].trigger('click')
    await rows[1].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.delete-bar').exists()).toBe(true)
  })

  it('clicking delete bar button opens confirm dialog', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.findAll('.animal-row')[0].trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('.delete-bar .btn-danger').trigger('click')
    await wrapper.vm.$nextTick()

    const dialog = wrapper.findComponent(ConfirmDialogStub)
    expect(dialog.props('show')).toBe(true)
  })

  it('confirming dialog calls batchDelete with selected IDs', async () => {
    mockApi.post.mockResolvedValue({})

    const wrapper = mountComponent()
    await flushPromises()

    // Select first two rows
    await wrapper.findAll('.animal-row')[0].trigger('click')
    await wrapper.findAll('.animal-row')[1].trigger('click')
    await wrapper.vm.$nextTick()

    // Open dialog
    await wrapper.find('.delete-bar .btn-danger').trigger('click')
    await wrapper.vm.$nextTick()

    // Confirm via dialog emit
    const dialog = wrapper.findComponent(ConfirmDialogStub)
    await dialog.vm.$emit('confirm')
    await flushPromises()

    expect(mockApi.post).toHaveBeenCalledWith('/animals/batch-delete', {
      ids: ['a1', 'a2'],
    })
  })

  it('cancelling dialog does not call batchDelete', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.findAll('.animal-row')[0].trigger('click')
    await wrapper.vm.$nextTick()

    await wrapper.find('.delete-bar .btn-danger').trigger('click')
    await wrapper.vm.$nextTick()

    const dialog = wrapper.findComponent(ConfirmDialogStub)
    await dialog.vm.$emit('cancel')
    await wrapper.vm.$nextTick()

    expect(mockApi.post).not.toHaveBeenCalled()
    expect(dialog.props('show')).toBe(false)
  })

  it('select-all button selects all visible rows', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('.btn-link').trigger('click')
    await wrapper.vm.$nextTick()

    const selectedRows = wrapper.findAll('.animal-row.selected')
    expect(selectedRows).toHaveLength(3)
  })
})
