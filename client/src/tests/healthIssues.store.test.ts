import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useHealthIssuesStore } from '../stores/healthIssues'
import api from '../services/api'

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../db/indexedDB', () => ({
  default: {
    healthIssues: {
      bulkPut: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })),
    },
  },
}))

vi.mock('../services/syncManager', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
  dequeueByEntityId: vi.fn().mockResolvedValue(undefined),
  isOfflineError: vi.fn().mockReturnValue(false),
}))

// setup.js creates a fresh Pinia before each test

const ISSUE_FIXTURE = {
  id: 'issue-1',
  cow_id: 'cow-1',
  issue_types: ['mastitis'],
  affected_teats: ['front_left'],
  severity: 'medium',
  status: 'open',
  tag_number: 'T-001',
  reported_by_name: 'Test Admin',
}

describe('useHealthIssuesStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── fetchByCow ───────────────────────────────────────────────────────────

  describe('fetchByCow', () => {
    it('fetches issues for a cow and stores them', async () => {
      api.get.mockResolvedValue({ data: [ISSUE_FIXTURE] })

      const store = useHealthIssuesStore()
      const result = await store.fetchByCow('cow-1')

      expect(api.get).toHaveBeenCalledWith('/health-issues', { params: { animal_id: 'cow-1' } })
      expect(store.issues).toContainEqual(ISSUE_FIXTURE)
      expect(result).toEqual([ISSUE_FIXTURE])
    })

    it('merges issues by animal_id (replaces existing for same animal)', async () => {
      const oldIssue = { ...ISSUE_FIXTURE, id: 'old', animal_id: 'cow-1' }
      const newIssue = { ...ISSUE_FIXTURE, id: 'new', animal_id: 'cow-1' }
      api.get.mockResolvedValue({ data: [newIssue] })

      const store = useHealthIssuesStore()
      store.issues = [oldIssue]
      await store.fetchByCow('cow-1')

      const cowIssues = store.issues.filter((i) => i.animal_id === 'cow-1')
      expect(cowIssues).toHaveLength(1)
      expect(cowIssues[0].id).toBe('new')
    })

    it('falls back to IndexedDB on network error', async () => {
      const localIssue = { ...ISSUE_FIXTURE, id: 'local-1' }
      api.get.mockRejectedValue(new Error('Network error'))

      const { default: db } = await import('../db/indexedDB')
      db.healthIssues.where.mockReturnValue({
        equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([localIssue]) })),
      })

      const store = useHealthIssuesStore()
      const result = await store.fetchByCow('cow-1')

      expect(result).toContainEqual(localIssue)
      expect(store.error).not.toBeNull()
    })

    it('sets loadingByCow true during fetch, false after', async () => {
      let resolveRequest
      api.get.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = () => resolve({ data: [] })
        })
      )

      const store = useHealthIssuesStore()
      const fetchPromise = store.fetchByCow('cow-1')
      expect(store.loadingByCow).toBe(true)

      resolveRequest()
      await fetchPromise
      expect(store.loadingByCow).toBe(false)
    })
  })

  // ─── fetchOne ─────────────────────────────────────────────────────────────

  describe('fetchOne', () => {
    it('fetches a single issue and stores it', async () => {
      api.get.mockResolvedValue({ data: ISSUE_FIXTURE })

      const store = useHealthIssuesStore()
      const result = await store.fetchOne('issue-1')

      expect(api.get).toHaveBeenCalledWith('/health-issues/issue-1')
      expect(result).toEqual(ISSUE_FIXTURE)
      expect(store.issues).toContainEqual(ISSUE_FIXTURE)
    })

    it('updates an existing issue in state if already cached', async () => {
      const stale = { ...ISSUE_FIXTURE, severity: 'low' }
      const fresh = { ...ISSUE_FIXTURE, severity: 'high' }
      api.get.mockResolvedValue({ data: fresh })

      const store = useHealthIssuesStore()
      store.issues = [stale]

      await store.fetchOne('issue-1')
      expect(store.issues[0].severity).toBe('high')
    })

    it('falls back to cached issue on network error', async () => {
      api.get.mockRejectedValue(new Error('Offline'))

      const store = useHealthIssuesStore()
      store.issues = [ISSUE_FIXTURE]

      const result = await store.fetchOne('issue-1')
      expect(result).toEqual(ISSUE_FIXTURE)
    })

    it('throws when no cache and network fails', async () => {
      api.get.mockRejectedValue(new Error('Offline'))

      const store = useHealthIssuesStore()
      await expect(store.fetchOne('missing-id')).rejects.toThrow()
    })
  })

  // ─── fetchAll ─────────────────────────────────────────────────────────────

  describe('fetchAll', () => {
    it('fetches paginated issues into allIssues', async () => {
      const issues = [ISSUE_FIXTURE]
      api.get.mockResolvedValue({ data: issues, headers: { 'x-total-count': '1' } })

      const store = useHealthIssuesStore()
      await store.fetchAll({ page: 1, limit: 20 })

      expect(store.allIssues).toEqual(issues)
      expect(store.allIssuesTotal).toBe(1)
    })

    it('sets loadingAll during fetch', async () => {
      let resolveRequest
      api.get.mockReturnValue(
        new Promise((resolve) => {
          resolveRequest = () => resolve({ data: [], headers: { 'x-total-count': '0' } })
        })
      )

      const store = useHealthIssuesStore()
      const p = store.fetchAll()
      expect(store.loadingAll).toBe(true)

      resolveRequest()
      await p
      expect(store.loadingAll).toBe(false)
    })
  })

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('posts to /health-issues and prepends to issues', async () => {
      const created = { ...ISSUE_FIXTURE, id: 'created-1' }
      api.post.mockResolvedValue({ data: created })

      const store = useHealthIssuesStore()
      const result = await store.create({
        cow_id: 'cow-1',
        issue_types: ['mastitis'],
        observed_at: '2026-01-01T00:00:00Z',
      })

      expect(api.post).toHaveBeenCalledWith('/health-issues', expect.any(Object))
      expect(store.issues[0]).toEqual(created)
      expect(result).toEqual(created)
    })
  })

  // ─── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('patches status and updates the issue in state', async () => {
      const updated = { ...ISSUE_FIXTURE, status: 'resolved' }
      api.patch.mockResolvedValue({ data: updated })

      const store = useHealthIssuesStore()
      store.issues = [ISSUE_FIXTURE]

      const result = await store.updateStatus('issue-1', 'resolved')

      expect(api.patch).toHaveBeenCalledWith('/health-issues/issue-1/status', {
        status: 'resolved',
      })
      expect(store.issues[0].status).toBe('resolved')
      expect(result).toEqual(updated)
    })
  })

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes the issue and removes it from state', async () => {
      api.delete.mockResolvedValue({})

      const store = useHealthIssuesStore()
      store.issues = [ISSUE_FIXTURE, { ...ISSUE_FIXTURE, id: 'issue-2' }]

      await store.remove('issue-1')

      expect(api.delete).toHaveBeenCalledWith('/health-issues/issue-1')
      expect(store.issues).toHaveLength(1)
      expect(store.issues[0].id).toBe('issue-2')
    })
  })

  // ─── getAnimalIssues / getById ────────────────────────────────────────────────

  describe('getAnimalIssues', () => {
    it('returns issues filtered by animal_id', () => {
      const store = useHealthIssuesStore()
      store.issues = [
        { ...ISSUE_FIXTURE, id: 'i1', animal_id: 'cow-1' },
        { ...ISSUE_FIXTURE, id: 'i2', animal_id: 'cow-2' },
        { ...ISSUE_FIXTURE, id: 'i3', animal_id: 'cow-1' },
      ]
      expect(store.getAnimalIssues('cow-1')).toHaveLength(2)
      expect(store.getAnimalIssues('cow-2')).toHaveLength(1)
    })
  })

  describe('getById', () => {
    it('returns the issue with matching id', () => {
      const store = useHealthIssuesStore()
      store.issues = [ISSUE_FIXTURE]
      expect(store.getById('issue-1')).toEqual(ISSUE_FIXTURE)
    })

    it('returns null when not found', () => {
      const store = useHealthIssuesStore()
      expect(store.getById('nope')).toBeNull()
    })
  })

  // ─── Comments ─────────────────────────────────────────────────────────────

  describe('fetchComments', () => {
    it('fetches and stores comments by issue id', async () => {
      const comments = [{ id: 'c1', comment: 'Hello', author_name: 'Admin' }]
      api.get.mockResolvedValue({ data: comments })

      const store = useHealthIssuesStore()
      const result = await store.fetchComments('issue-1')

      expect(api.get).toHaveBeenCalledWith('/health-issues/issue-1/comments')
      expect(store.getComments('issue-1')).toEqual(comments)
      expect(result).toEqual(comments)
    })
  })

  describe('addComment', () => {
    it('posts a comment and appends it to the list', async () => {
      const newComment = { id: 'c2', comment: 'New note', author_name: 'Admin' }
      api.post.mockResolvedValue({ data: newComment })

      const store = useHealthIssuesStore()
      store.comments = { 'issue-1': [{ id: 'c1', comment: 'Old', author_name: 'Admin' }] }

      await store.addComment('issue-1', 'New note')

      expect(api.post).toHaveBeenCalledWith('/health-issues/issue-1/comments', {
        comment: 'New note',
      })
      expect(store.getComments('issue-1')).toHaveLength(2)
      expect(store.getComments('issue-1')[1]).toEqual(newComment)
    })
  })

  describe('removeComment', () => {
    it('deletes a comment and removes it from the list', async () => {
      api.delete.mockResolvedValue({})

      const store = useHealthIssuesStore()
      store.comments = {
        'issue-1': [
          { id: 'c1', comment: 'Keep' },
          { id: 'c2', comment: 'Remove' },
        ],
      }

      await store.removeComment('issue-1', 'c2')

      expect(api.delete).toHaveBeenCalledWith('/health-issues/issue-1/comments/c2')
      expect(store.getComments('issue-1')).toHaveLength(1)
      expect(store.getComments('issue-1')[0].id).toBe('c1')
    })
  })

  describe('getComments', () => {
    it('returns an empty array when no comments are cached', () => {
      const store = useHealthIssuesStore()
      expect(store.getComments('unknown-issue')).toEqual([])
    })
  })
})
