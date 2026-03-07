---
name: code-standards
description: Universal code quality standards. Load when writing or reviewing any code. Covers naming, error handling, security, performance, and anti-patterns. Sources — Vue.js Style Guide, Express.js Best Practices, OWASP guidelines.
---

# Code Standards

Universal standards that apply to ALL code in the project. These prevent the most common audit findings.

## 1. Naming

### Variables and Functions
- **Descriptive intent** — `getUserById`, `isActive`, `totalAmount` not `get`, `flag`, `x`
- **Boolean prefixes** — `is`, `has`, `can`, `should`: `isLoading`, `hasPermission`, `canEdit`
- **Collections are plural** — `users`, `items`, `milkRecords`
- **Single items are singular** — `user`, `item`, `record`
- **Event handlers** — `onSubmit`, `handleClick`, `onCowSelect`
- **Async functions** — name describes what they return: `fetchUsers`, `createCow`, `syncPendingChanges`

### Constants
- **UPPER_SNAKE_CASE** for true constants: `MAX_RETRIES`, `DEFAULT_PAGE_SIZE`
- **Regular camelCase** for computed/derived values even if they don't change

### Files
- **Vue components** — PascalCase: `CowCard.vue`, `MilkRecordForm.vue`
- **JS modules** — camelCase: `syncManager.js`, `breedingCalc.js`
- **Test files** — match source: `syncManager.test.js`, `CowCard.test.js`
- **Multi-word component names** (Vue essential rule) — never single-word: `TodoItem` not `Item`

### Anti-patterns
```js
// BAD — generic, abbreviated, unclear
const d = new Date()
const res = await fetch(url)
const temp = users.filter(u => u.active)
function proc(items) { ... }
const data = await api.get('/cows')

// GOOD — descriptive, self-documenting
const createdAt = new Date()
const response = await fetch(url)
const activeUsers = users.filter(user => user.active)
function filterExpiredTreatments(treatments) { ... }
const cows = await api.get('/cows')
```

## 2. Error Handling

### Rules
- **Never swallow errors** — no empty `catch {}` blocks
- **Always add context** — what failed, what was expected, what was received
- **Let errors propagate** — don't catch just to re-throw without adding value
- **Use `next(err)` in Express** — never leave a request hanging
- **Handle errors at the right level** — route handlers catch, services throw

### Express route pattern
```js
router.get('/:id', async (req, res, next) => {
  try {
    const cow = await db('cows').where({ id: req.params.id }).first()
    if (!cow) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Cow not found' }
      })
    }
    res.json(cow)
  } catch (err) {
    next(err)  // Global error handler catches this
  }
})
```

### Vue component pattern
```js
async function fetchCows() {
  isLoading.value = true
  error.value = null
  try {
    const { data } = await api.get('/api/cows')
    cows.value = data
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load cows'
    // Don't swallow — user needs to know something went wrong
  } finally {
    isLoading.value = false
  }
}
```

### Anti-patterns
```js
// BAD — swallowed error
try { await save() } catch (e) {}

// BAD — catch just to re-throw
try { await save() } catch (e) { throw e }

// BAD — generic message
catch (e) { throw new Error('Error') }

// BAD — logging without handling
catch (e) { console.log(e) }

// GOOD — context + proper handling
catch (err) {
  throw new Error(`Failed to save cow ${cow.id}: ${err.message}`)
}
```

## 3. Security (OWASP + Express + Vue official)

### Input Validation
- **Validate ALL user input at API boundaries** with Joi schemas
- **Use `abortEarly: false`** to collect all errors
- **Use `stripUnknown: true`** to remove unexpected fields
- **Use the validated `value`**, never raw `req.body`

```js
const { error, value } = schema.validate(req.body, {
  abortEarly: false,
  stripUnknown: true
})
if (error) return res.status(400).json({ ... })
// Use `value` from here, NOT req.body
```

### SQL Injection Prevention
```js
// BAD — string concatenation
const rows = await db.raw(`SELECT * FROM cows WHERE name = '${name}'`)

// GOOD — parameterized binding
const rows = await db('cows').where({ name })
const rows = await db.raw('SELECT * FROM cows WHERE name = ?', [name])
```

### XSS Prevention (Vue official docs)
- **Never use `v-html` with user input** — Vue auto-escapes `{{ }}` and `:attr`
- **Never use user input as component templates** — equivalent to arbitrary JS execution
- **Sanitize URLs on the backend** before saving — `javascript:` URLs bypass frontend checks
- **Whitelist style properties** — don't bind full `style` objects from user input (clickjacking risk)

### Auth & Authorization
- **Every route needs `auth` middleware** except login/public endpoints
- **Use `authorize(permission)` middleware** for permission-gated routes
- **Check ownership** — can user A access/modify user B's data?
- **Never expose sensitive data** — strip password hashes, tokens, internal errors from responses

### Headers & Protection
- **Use Helmet** — sets Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, etc.
- **Use rate limiting** — protect login/auth endpoints from brute force
- **Disable `X-Powered-By`** — `app.disable('x-powered-by')`

## 4. Performance

### Express (official best practices)
- **Never use synchronous functions** — they block the event loop
- **Use gzip compression** via middleware or reverse proxy
- **Set `NODE_ENV=production`** — 3x performance improvement (caches views, less verbose errors)
- **Don't use `console.log`/`console.error` in production** — use structured logging (Pino)

### Vue (official performance guide)
- **Use `defineAsyncComponent`** for lazy-loaded components
- **Use lazy route loading** — `component: () => import('./View.vue')`
- **Keep props stable** — pass computed booleans instead of IDs that change
- **Use `v-once`** for static content that never updates
- **Use `v-memo`** for expensive list items with known dependencies
- **Use `shallowRef`** for large immutable data structures
- **Virtualize large lists** — don't render 1000+ DOM nodes
- **Use `computed`** not methods for derived values (caching)

### Database
- **Avoid N+1 queries** — use joins, not loops with DB calls
- **Coerce aggregates** — `Number(count)` because SQLite returns strings
- **Add indexes** for frequently queried columns
- **Use pagination** for list endpoints that could return many rows

## 5. Dead Code Prevention

The #1 audit finding. Prevent it at the source:

- **Delete commented-out code** — git has history
- **Delete unused imports** immediately after removing usage
- **Delete unused variables** — don't prefix with `_` unless it's a deliberate unused parameter
- **Delete unreachable code** — no code after `return` or `throw`
- **Don't export unless something imports** — check before adding `export`
- **Don't create "just in case" helpers** — write code when needed, not speculatively

## 6. Function Design

- **Max 30 lines** — extract named functions for readability
- **Max 3 parameters** — use an options object for more
- **Max 3 levels of nesting** — use guard clauses and early returns
- **Single responsibility** — one function does one thing
- **Pure where possible** — no side effects, deterministic output

### Guard clause pattern
```js
// BAD — deeply nested
function processOrder(order) {
  if (order) {
    if (order.items.length > 0) {
      if (order.status === 'pending') {
        // actual logic buried 3 levels deep
      }
    }
  }
}

// GOOD — guard clauses, flat
function processOrder(order) {
  if (!order) return
  if (order.items.length === 0) return
  if (order.status !== 'pending') return

  // actual logic at top level
}
```

## 7. Async Patterns

- **Always `await` promises** — no fire-and-forget unless explicitly intended
- **Use `Promise.all()`** for independent concurrent operations
- **Use `try/catch`** around every `await` in Express routes (or let Express 5 handle it)
- **Clean up resources** in `finally` blocks (loading states, connections)

```js
// BAD — sequential when parallel is safe
const users = await fetchUsers()
const settings = await fetchSettings()

// GOOD — parallel
const [users, settings] = await Promise.all([
  fetchUsers(),
  fetchSettings()
])

// BAD — fire-and-forget (lost errors)
saveAnalytics(event)

// GOOD — awaited or explicitly caught
await saveAnalytics(event)
// or
saveAnalytics(event).catch(err => logger.warn('Analytics save failed', err))
```

## 8. API Response Consistency

Every API endpoint must follow these shapes:

```js
// Success — single item
res.json(item)              // 200
res.status(201).json(item)  // 201 Created

// Success — list (plain)
res.json(items)             // 200, returns array

// Success — list (paginated)
res.json({ data: items, total: Number(count) })  // 200

// Error — always same shape
res.status(400).json({
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Human-readable description',
    details: [...]  // Array of specific issues
  }
})

// No content
res.status(204).end()       // DELETE success
```

Status codes: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 500 Internal Error.
