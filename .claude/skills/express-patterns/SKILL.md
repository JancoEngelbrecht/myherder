---
name: express-patterns
description: Load when building Express.js APIs. Covers route structure, middleware, Joi validation, Knex queries, error handling, and auth patterns. Based on Express 5 + Knex + better-sqlite3/mysql2 stack. Sources — Express.js official best practices (expressjs.com), Joi API docs (joi.dev), OWASP guidelines.
---

# Express Patterns

## Route Structure

One file per resource in `server/routes/`. Each file exports a router.

```js
const express = require('express')
const router = express.Router()
const db = require('../config/database')
const auth = require('../middleware/auth')
const { authorize } = require('../middleware/authorize')

// All routes require authentication
router.use(auth)

// GET /api/resource — list
router.get('/', async (req, res, next) => {
  try {
    const rows = await db('table_name')
      .select('id', 'name', 'created_at')
      .orderBy('created_at', 'desc')
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

module.exports = router
```

### Mounting routes
```js
// server/app.js
app.use('/api/resource', require('./routes/resource'))
```

## Request Validation with Joi

Validate at the route level, before any business logic. Define schemas at the top of the route file.

```js
const Joi = require('joi')

const createSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required(),
  email: Joi.string().email().required(),
  role: Joi.string().valid('admin', 'worker').default('worker')
})

router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body, { abortEarly: false })
    if (error) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.details.map(d => d.message)
        }
      })
    }

    // Use `value` (sanitized), not `req.body` (raw)
    const [id] = await db('users').insert({ ...value, id: uuid() })
    const user = await db('users').where({ id: value.id || id }).first()
    res.status(201).json(user)
  } catch (err) {
    next(err)
  }
})
```

### Joi best practices (source: joi.dev official API docs)

**Always use these validate options:**
```js
schema.validate(req.body, {
  abortEarly: false,    // Collect ALL errors, not just the first
  stripUnknown: true    // Remove fields not in the schema
})
```

**Common patterns:**
```js
// UUID ID (never use .integer() for UUIDs)
Joi.string().uuid().required()

// Enum values
Joi.string().valid('admin', 'worker').required()

// Array of strings (for JSON columns in SQLite)
Joi.array().items(Joi.string()).default([])

// Date string
Joi.date().iso().required()

// Cross-field validation with Joi.ref()
const schema = Joi.object({
  password: Joi.string().min(8).required(),
  confirmPassword: Joi.ref('password')
}).with('password', 'confirmPassword')

// Conditional validation with .when()
const schema = Joi.object({
  type: Joi.string().valid('personal', 'business').required(),
  companyName: Joi.string().when('type', {
    is: 'business',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  })
})

// Pagination params (reusable)
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().default('created_at'),
  order: Joi.string().valid('asc', 'desc').default('desc')
})

// Custom error messages
Joi.string().email().required().messages({
  'string.email': 'Please provide a valid email address',
  'any.required': 'Email is required'
})
```

**Anti-patterns:**
- Don't define schemas inline in route handlers — define at top of file
- Don't use `req.body` after validation — use the returned `value` (it's sanitized)
- Don't skip `abortEarly: false` — users need to see all errors at once
- Don't forget `stripUnknown: true` — prevents mass assignment attacks

## CRUD Route Patterns

### GET (list) — with optional pagination

```js
router.get('/', async (req, res, next) => {
  try {
    const { page, limit } = req.query

    // Dual mode: paginated if page param exists, plain array otherwise
    if (page) {
      const offset = (Number(page) - 1) * Number(limit || 20)
      const [rows, [{ count }]] = await Promise.all([
        db('items').select('*').limit(limit).offset(offset).orderBy('created_at', 'desc'),
        db('items').count('* as count')
      ])
      return res.json({ data: rows, total: Number(count) })
    }

    const rows = await db('items').select('*').orderBy('created_at', 'desc')
    res.json(rows)
  } catch (err) {
    next(err)
  }
})
```

### GET (single)

```js
router.get('/:id', async (req, res, next) => {
  try {
    const item = await db('items').where({ id: req.params.id }).first()
    if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found' } })
    res.json(item)
  } catch (err) {
    next(err)
  }
})
```

### POST (create)

```js
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = createSchema.validate(req.body, { abortEarly: false })
    if (error) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.details.map(d => d.message) } })

    const id = uuid()
    const now = new Date().toISOString()
    await db('items').insert({ ...value, id, created_at: now, updated_at: now })
    const item = await db('items').where({ id }).first()
    res.status(201).json(item)
  } catch (err) {
    next(err)
  }
})
```

### PUT (update)

```js
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await db('items').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found' } })

    const { error, value } = updateSchema.validate(req.body, { abortEarly: false })
    if (error) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.details.map(d => d.message) } })

    await db('items').where({ id: req.params.id }).update({ ...value, updated_at: new Date().toISOString() })
    const item = await db('items').where({ id: req.params.id }).first()
    res.json(item)
  } catch (err) {
    next(err)
  }
})
```

### DELETE (soft delete)

```js
router.delete('/:id', authorize('can_manage_items'), async (req, res, next) => {
  try {
    const existing = await db('items').where({ id: req.params.id }).first()
    if (!existing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found' } })

    // Soft delete — set deleted_at, don't remove the row
    await db('items').where({ id: req.params.id }).update({ deleted_at: new Date().toISOString() })
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
```

## Middleware Patterns

### Auth middleware (JWT)

```js
// server/middleware/auth.js
const jwt = require('jsonwebtoken')

function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No token provided' } })
  }

  try {
    const token = header.split(' ')[1]
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch (err) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } })
  }
}
```

### Authorization middleware (permission-based)

```js
// server/middleware/authorize.js
function authorize(permission) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next() // Admin bypasses
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } })
    }
    next()
  }
}
```

### Apply to routes

```js
// All routes in file require auth
router.use(auth)

// Specific routes require permissions
router.post('/', authorize('can_manage_cows'), async (req, res, next) => { ... })
router.delete('/:id', authorize('can_manage_cows'), async (req, res, next) => { ... })
```

## Error Handling

### Global error handler

```js
// server/middleware/errorHandler.js
function errorHandler(err, req, res, next) {
  // DB constraint violations → 409
  if (err.code === 'SQLITE_CONSTRAINT' || err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Resource already exists or constraint violated' } })
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
}

// Mount LAST — after all routes
app.use(errorHandler)
```

### Route-level error handling

Always wrap async route handlers in try/catch and call `next(err)`:

```js
router.get('/', async (req, res, next) => {
  try {
    // ... route logic ...
  } catch (err) {
    next(err)  // Sends to global error handler
  }
})
```

## Knex Query Patterns

### Joins with denormalized names

```js
// Return related entity names as flat fields (avoid N+1)
const cows = await db('cows')
  .leftJoin('breed_types', 'cows.breed_type_id', 'breed_types.id')
  .leftJoin('cows as sire', 'cows.sire_id', 'sire.id')
  .leftJoin('cows as dam', 'cows.dam_id', 'dam.id')
  .select(
    'cows.*',
    'breed_types.name as breed_type_name',
    'sire.name as sire_name',
    'dam.name as dam_name'
  )
  .whereNull('cows.deleted_at')
```

### Never use `.returning('*')`

SQLite and MySQL don't support it properly. After insert, fetch the record:

```js
const id = uuid()
await db('items').insert({ ...value, id })
const item = await db('items').where({ id }).first()
```

### Aggregate coercion

SQLite returns strings for COUNT/SUM. Always coerce:

```js
const { count } = await db('items').count('* as count').first()
const total = Number(count)
```

### JSON columns in SQLite

SQLite has no array type. Serialize on write, parse on read:

```js
// Write
await db('health_issues').insert({
  ...value,
  affected_teats: JSON.stringify(value.affected_teats || [])
})

// Read
const issue = await db('health_issues').where({ id }).first()
issue.affected_teats = JSON.parse(issue.affected_teats || '[]')
```

## UUID Pattern

All entity IDs are UUIDs. Never use auto-increment, never parse IDs as numbers.

```js
const { v4: uuid } = require('uuid')

// Generate on create
const id = uuid()
await db('items').insert({ ...value, id })

// Route params are strings — use directly
router.get('/:id', async (req, res, next) => {
  const item = await db('items').where({ id: req.params.id }).first()
  // NEVER: Number(req.params.id) — UUIDs are not numbers
})
```

## Timestamps

Always set `created_at` and `updated_at` on insert, update `updated_at` on every write:

```js
const now = new Date().toISOString()

// Create
await db('items').insert({ ...value, id: uuid(), created_at: now, updated_at: now })

// Update
await db('items').where({ id }).update({ ...value, updated_at: new Date().toISOString() })
```

## Testing Express Routes

### Test setup (Jest)

```js
// server/tests/routes/items.test.js
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

### Test patterns

```js
describe('GET /api/items', () => {
  it('returns all items for authenticated user', async () => {
    const res = await request(app)
      .get('/api/items')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200)

    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })

  it('returns 401 without token', async () => {
    await request(app)
      .get('/api/items')
      .expect(401)
  })
})

describe('POST /api/items', () => {
  it('creates item with valid data', async () => {
    const res = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Item' })
      .expect(201)

    expect(res.body.name).toBe('Test Item')
    expect(res.body.id).toBeDefined()
  })

  it('returns 400 with invalid data', async () => {
    const res = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({}) // missing required fields
      .expect(400)

    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
```

## Security (source: expressjs.com/en/advanced/best-practice-security)

### Mandatory for every Express app:
- **Use Helmet** — `app.use(helmet())` — sets CSP, HSTS, X-Frame-Options, etc.
- **Disable fingerprinting** — `app.disable('x-powered-by')`
- **Use rate limiting** on auth endpoints — `express-rate-limit`
- **Validate ALL input** — Joi with `stripUnknown: true` prevents mass assignment
- **Parameterize ALL queries** — never concatenate user input into SQL
- **Use HTTPS/TLS** — Let's Encrypt for free certs, or terminate at reverse proxy
- **Sanitize URLs** — validate redirect URLs to prevent open redirects
- **Secure cookies** — `httpOnly: true`, `secure: true`, `sameSite: 'strict'`
- **Run `npm audit`** regularly — fix known vulnerabilities in dependencies

### Custom error handlers (don't leak internals):
```js
// Custom 404 — mount after all routes
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
})

// Custom error handler — mount LAST
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)  // Delegate if headers already sent

  // DB constraint violations
  if (err.code === 'SQLITE_CONSTRAINT' || err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Resource already exists' } })
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } })
})
```

## Performance (source: expressjs.com/en/advanced/best-practice-performance)

- **Set `NODE_ENV=production`** — 3x performance improvement (Express caches views, generates fewer error details)
- **Use gzip compression** — `app.use(compression())` or at reverse proxy level
- **Never use synchronous functions** — they block the event loop for all users
- **Don't use `console.log`** — it's synchronous. Use structured logging (Pino)
- **Handle exceptions properly** — always `try/catch` async handlers, always `next(err)`
- **Use `Promise.all()`** for independent parallel queries
- **Cache responses** for rarely-changing data (breed types, settings)
- **Use reverse proxy** in production (Nginx) for compression, caching, static files

## Anti-patterns

- **Don't call `res.json()` after `next(err)`** — pick one response path
- **Don't use `req.body` directly** — always validate first, use the sanitized `value`
- **Don't catch errors just to re-throw** — let them propagate to the global handler
- **Don't put business logic in routes** — extract to services for complex operations
- **Don't return stack traces in production** — the error handler should hide internals
- **Don't forget `next(err)` in catch blocks** — without it, the request hangs
- **Don't use `async` middleware without error handling** — Express 5 auto-catches rejected promises, but be explicit for clarity
- **Don't use synchronous functions** — they block the entire event loop
- **Don't skip `helmet()`** — it's a one-line security improvement
- **Don't hardcode secrets** — use environment variables, validate them at startup

## Tenant-Scoped Routes

### tenantScope middleware
All routes except auth/settings/announcements go through `tenantScope`, which sets `req.farmId` from JWT:

```js
// Every query must scope by farm_id
const items = await db('items').where({ farm_id: req.farmId });

// Every insert must include farm_id
await db('items').insert({ ...value, id: uuid(), farm_id: req.farmId });

// Updates/deletes must scope lookup by farm_id (not just id)
const item = await db('items').where({ id: req.params.id, farm_id: req.farmId }).first();
if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND' } });
```

### Query helpers accept farmId
Never use global caches — they leak data across tenants:
```js
function baseQuery(db, farmId) {
  return db('items').where('items.farm_id', farmId).whereNull('items.deleted_at');
}
```

## API Error Translation

Backend returns i18n keys as error messages. Frontend must translate:

```js
// client/src/utils/apiError.js exports:
// - extractApiError(err) — extracts error string from Axios error
// - resolveError(t, errorString) — translates i18n key, falls back to raw string

// Usage in Vue components:
import { extractApiError, resolveError } from '@/utils/apiError';

catch (err) {
  toast.error(resolveError(t, extractApiError(err)));
}
```

**Common mistake:** Using `extractApiError()` alone shows raw keys like `"errors.network"` to users. Always wrap with `resolveError(t, ...)`.
