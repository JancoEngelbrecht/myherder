---
name: testing
description: Load when writing or reviewing tests. Covers test structure, naming, patterns, and what to test vs what to skip. Sources — Vitest official docs (vitest.dev), Jest official docs, testing best practices from Vue and Express communities.
---

# Testing Standards

## Test Structure

Follow Arrange-Act-Assert (AAA) pattern:

```
// Arrange — set up test data and dependencies
const user = createTestUser({ role: "admin" });
const service = new UserService(mockRepo);

// Act — execute the thing being tested
const result = await service.deactivate(user.id);

// Assert — verify the outcome
expect(result.active).toBe(false);
expect(mockRepo.save).toHaveBeenCalledWith(user.id, { active: false });
```

Separate each section with a blank line for readability.

## Test Naming

Describe the scenario, not the implementation:

```
// GOOD — describes behavior
"returns empty array when user has no orders"
"throws ValidationError when email format is invalid"
"sends notification email after successful registration"

// BAD — describes implementation
"test getUserOrders"
"should call validate"
"email test"
```

## What to Test

### Always Test
- Business logic and domain rules
- Input validation and edge cases
- Error handling paths
- Integration points (API calls, database queries)
- State transitions

### Skip Testing
- Framework code (React rendering, Express routing)
- Simple getters/setters with no logic
- Third-party library internals
- Exact CSS/HTML output (use visual testing for that)

## Test Patterns

### Mock External Dependencies
```
// Mock the HTTP client, not the business logic
const mockHttp = { get: vi.fn().mockResolvedValue({ data: testUser }) };
const service = new UserService(mockHttp);
```

### Test Edge Cases
- Empty inputs (null, undefined, empty string, empty array)
- Boundary values (0, -1, MAX_INT, empty string vs whitespace)
- Concurrent access (if applicable)
- Large inputs (performance)
- Unicode and special characters

### Test Error Paths
- Invalid input → appropriate error type and message
- External service down → graceful degradation or retry
- Timeout → proper cleanup and error propagation
- Permission denied → correct status code and message

## Vitest Patterns (source: vitest.dev)

### Mocking

```js
// Mock a module
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}))

// Mock a function
const handler = vi.fn()
handler.mockResolvedValue({ data: [] })  // async mock
handler.mockReturnValue(42)              // sync mock

// Spy on an existing function
const spy = vi.spyOn(object, 'method')
expect(spy).toHaveBeenCalledWith('arg1', 'arg2')
expect(spy).toHaveBeenCalledTimes(1)

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()  // Clears call history, keeps implementation
  // vi.resetAllMocks()  // Also resets implementation
  // vi.restoreAllMocks()  // Restores original implementation
})
```

### Key matchers

```js
// Equality
expect(value).toBe(exact)           // === strict equality
expect(value).toEqual(deep)         // Deep equality (objects/arrays)
expect(value).toStrictEqual(deep)   // Deep equality + checks undefined props

// Truthiness
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeNull()
expect(value).toBeDefined()

// Numbers
expect(value).toBeGreaterThan(3)
expect(value).toBeCloseTo(0.3, 5)   // For floating point

// Strings
expect(value).toMatch(/pattern/)
expect(value).toContain('substring')

// Arrays/Objects
expect(array).toContain(item)
expect(array).toHaveLength(3)
expect(object).toHaveProperty('key', 'value')

// Errors
expect(() => fn()).toThrow()
expect(() => fn()).toThrow('message')
await expect(asyncFn()).rejects.toThrow('message')

// Async
await expect(promise).resolves.toBe(value)
await expect(promise).rejects.toThrow()
```

## Anti-Patterns to Avoid

- **Test interdependence** — each test must work in isolation. Use `beforeEach` to reset state.
- **Testing implementation** — don't assert on internal method calls unless that IS the behavior
- **Flaky tests** — no random data, no timing-dependent assertions, no shared state
- **Giant test files** — split by feature/behavior, not one file per class
- **Copy-paste tests** — extract shared setup into helpers/fixtures
- **Assertions in loops** — if the loop is empty, the test passes vacuously
- **Over-mocking** — mock external boundaries (APIs, DB), not internal logic
- **Testing nothing** — every test must have at least one meaningful assertion
- **Snapshot abuse** — don't snapshot large objects. Assert specific properties instead.
- **Ignoring async** — always `await` async operations in tests. Unawaited promises silently pass.

## Coverage Guidance

- Aim for high coverage on business logic (80%+)
- Don't chase 100% — diminishing returns on boilerplate/config code
- Coverage is a signal, not a target — 100% coverage with bad assertions is worthless

## Backend Test Patterns (Jest + Supertest + Knex)

### Test setup

```js
// server/tests/routes/resource.test.js
const request = require('supertest')
const app = require('../../app')
const db = require('../../config/database')

beforeAll(async () => {
  await db.migrate.latest()
  await db.seed.run()
})

afterAll(async () => {
  await db.destroy()
})
```

Each test file gets its own in-memory SQLite database (configured in jest.config.js).

### Auth helper

```js
const jwt = require('jsonwebtoken')

function makeToken(overrides = {}) {
  return jwt.sign({
    id: 'test-user-id',
    username: 'testuser',
    role: 'admin',
    permissions: [],
    ...overrides
  }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' })
}

const adminToken = makeToken({ role: 'admin' })
const workerToken = makeToken({ role: 'worker', permissions: ['can_record_milk'] })
```

### Route test patterns

```js
describe('GET /api/items', () => {
  it('returns items for authenticated user', async () => {
    const res = await request(app)
      .get('/api/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    expect(Array.isArray(res.body)).toBe(true)
  })

  it('returns 401 without token', async () => {
    await request(app).get('/api/items').expect(401)
  })

  it('returns 403 for worker without permission', async () => {
    await request(app)
      .get('/api/items')
      .set('Authorization', `Bearer ${workerToken}`)
      .expect(403)
  })
})

describe('POST /api/items', () => {
  it('creates item with valid data', async () => {
    const res = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Item' })
      .expect(201)

    expect(res.body.id).toBeDefined()
    expect(res.body.name).toBe('Test Item')
  })

  it('returns 400 with validation errors for invalid data', async () => {
    const res = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({}) // missing required fields
      .expect(400)

    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details).toBeDefined()
  })
})
```

### What to test for every route

1. **Happy path** — correct status code and response shape
2. **Auth** — 401 without token, 403 without permission
3. **Validation** — 400 with invalid/missing data, correct error details
4. **Not found** — 404 for non-existent resource IDs
5. **Edge cases** — empty strings, boundary values, duplicate creates (409)

## MyHerder-Specific Test Patterns

### Two Testing Strategies

**Integration tests (real IndexedDB)** — for sync/offline-critical code:
```js
import 'fake-indexeddb/auto'  // MUST be first import
// Import real db, real syncManager — only mock api.js
```
- Use for: syncManager, store offline-first flows, sync store actions
- `beforeEach`: clear all tables, reset reactive refs (`isOnline`, `pendingCount`, etc.)
- `afterEach`: call `destroyListeners()` to prevent interval/listener leaks
- Reference files: `syncManager.test.js`, `cows.store.test.js`, `sync.store.test.js`

**Unit tests (mocked IndexedDB)** — for store CRUD logic:
```js
vi.mock('../db/indexedDB.js', () => ({ default: { tableName: { bulkPut: vi.fn(), put: vi.fn(), ... } } }))
vi.mock('../services/syncManager', () => ({ enqueue: vi.fn(), dequeueByEntityId: vi.fn(), isOfflineError: vi.fn().mockReturnValue(false) }))
```
- Use for: store fetch/create/update/delete when not testing sync integration
- Reference files: `healthIssues.store.test.js`, `milkRecords.store.test.js`

### Common Setup Patterns

```js
// Mock navigator.onLine (for offline tests)
let _onLine = true
Object.defineProperty(navigator, 'onLine', { get: () => _onLine, configurable: true })

// Clear all IndexedDB tables
async function clearAllTables() {
  for (const t of db.tables.map(t => t.name)) {
    await db.table(t).clear()
  }
}
```

### When to Use Which Strategy
- **Sync queue correctness, push/pull flows, conflict resolution** → integration (real IndexedDB)
- **Store CRUD happy paths, loading states, error messages** → unit (mocked)
- **Computed properties, pure functions** → unit (no mocks needed)
- **Component rendering, CSS classes** → mount with mocked stores

### Gotchas
- `vi.mock()` factories are hoisted — use `require('vue')` not `import` inside factory
- Dexie compound index warnings on syncQueue are cosmetic — safe to ignore
- Always `destroyListeners()` in afterEach when importing syncManager to prevent interval leaks
- Component tests use stub i18n with empty messages — "Not found" key warnings are harmless
