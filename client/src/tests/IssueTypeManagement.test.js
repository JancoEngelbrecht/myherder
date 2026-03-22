import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import IssueTypeManagement from '../views/admin/IssueTypeManagement.vue'

const mockRouter = { push: vi.fn(), back: vi.fn() }
vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('../services/api.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
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
    pushChanges: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('../db/indexedDB.js', () => ({
  default: {
    issueTypes: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
    },
    syncQueue: {
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
      }),
      bulkDelete: vi.fn(),
    },
  },
}))

const MOCK_ISSUE_TYPES = [
  {
    id: 'it1',
    code: 'mastitis',
    name: 'Mastitis',
    emoji: '🩺',
    requires_teat_selection: true,
    sort_order: 0,
    is_active: true,
  },
  {
    id: 'it2',
    code: 'lameness',
    name: 'Lameness',
    emoji: '🦶',
    requires_teat_selection: false,
    sort_order: 1,
    is_active: true,
  },
  {
    id: 'it3',
    code: 'old_issue',
    name: 'Old Issue',
    emoji: '⚠️',
    requires_teat_selection: false,
    sort_order: 2,
    is_active: false,
  },
]

const stubs = {
  SyncIndicator: true,
  SyncPanel: true,
  RouterLink: true,
  ConfirmDialog: true,
  SearchInput: true,
  PaginationBar: true,
}

async function mountWithData() {
  const api = (await import('../services/api.js')).default
  api.get.mockResolvedValue({
    data: MOCK_ISSUE_TYPES,
    headers: { 'x-total-count': '3' },
  })

  const wrapper = mount(IssueTypeManagement, {
    global: {
      stubs,
      mocks: { $route: { path: '/admin/issue-types' } },
    },
  })
  await flushPromises()
  return wrapper
}

describe('IssueTypeManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and displays issue types with emoji and name', async () => {
    const wrapper = await mountWithData()

    const cards = wrapper.findAll('.it-card')
    expect(cards).toHaveLength(3)
    expect(cards[0].find('.it-emoji').text()).toBe('🩺')
    expect(cards[0].find('.it-name').text()).toBe('Mastitis')
  })

  it('opens add form when FAB clicked', async () => {
    const wrapper = await mountWithData()

    await wrapper.find('.fab').trigger('click')
    expect(wrapper.find('.form-card').exists()).toBe(true)
    // In add mode, editing is null so title shows addTitle key
    expect(wrapper.find('.form-title').text()).toContain('issueTypes.addTitle')
  })

  it('opens edit form when edit button clicked', async () => {
    const wrapper = await mountWithData()

    const editBtns = wrapper
      .findAll('.btn-secondary.btn-sm')
      .filter((b) => b.text().includes('common.edit'))
    await editBtns[0].trigger('click')

    expect(wrapper.find('.form-card').exists()).toBe(true)
    expect(wrapper.find('.form-title').text()).toContain('issueTypes.editTitle')

    const nameInput = wrapper.find('#it-name')
    expect(nameInput.element.value).toBe('Mastitis')
  })

  it('shows page error on 409 when delete is blocked by in-use type', async () => {
    const api = (await import('../services/api.js')).default
    api.get.mockResolvedValue({
      data: MOCK_ISSUE_TYPES,
      headers: { 'x-total-count': '3' },
    })
    api.delete.mockRejectedValue({
      response: { status: 409, data: { error: 'Issue type is in use' } },
    })

    const wrapper = mount(IssueTypeManagement, {
      global: {
        stubs: { ...stubs, ConfirmDialog: false },
        mocks: { $route: { path: '/admin/issue-types' } },
      },
    })
    await flushPromises()

    // Trigger delete confirm on first card (second btn-danger is the delete button)
    const deleteBtns = wrapper.findAll('.btn-danger.btn-sm')
    await deleteBtns[1].trigger('click')

    // Find the delete dialog (has confirmLabel matching 'common.delete')
    const dialogs = wrapper.findAllComponents({ name: 'ConfirmDialog' })
    const deleteDialog = dialogs.find((d) => d.props('show'))
    await deleteDialog.vm.$emit('confirm')
    await flushPromises()

    expect(wrapper.find('.page-error').exists()).toBe(true)
  })
})
