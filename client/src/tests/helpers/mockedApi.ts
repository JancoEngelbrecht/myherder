import type { Mock } from 'vitest'

/**
 * Type for the `services/api` module after `vi.mock('../services/api', ...)`.
 * Tests replace the axios instance with plain vi.fn() mocks; this tells
 * TypeScript so `api.get.mockResolvedValue(...)` type-checks.
 * Note: all six methods are typed, but a test's vi.mock factory may define
 * only some of them — calling an undefined one fails at runtime, not in tsc.
 */
export type MockedApi = Record<'get' | 'post' | 'put' | 'patch' | 'delete' | 'head', Mock>
