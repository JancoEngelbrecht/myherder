# MyHerder Backend Test Suite

Comprehensive test coverage for the MyHerder dairy farm management backend.

## Test Results

```
Test Suites: 6 passed, 6 total
Tests:       72 passed, 72 total
Time:        ~1.7s
```

## Coverage

```
Overall:      89.91% statements | 80% branches | 81.96% functions | 91.09% lines
Routes:       92.15% statements | 91.37% branches
Services:     100% statements | 100% branches
Middleware:   93.1% statements | 72% branches
```

## Test Files

### `withdrawalService.test.js` (6 tests)

Unit tests for withdrawal date calculation logic:

- Null returns for zero withdrawal periods
- Milk withdrawal calculation from hours
- Meat withdrawal calculation from days
- Combined withdrawal date calculation
- Date object input handling
- Return type validation

### `auth.test.js` (16 tests)

Authentication and authorization testing:

- **Password login**: Valid credentials, wrong password, unknown user, missing fields
- **PIN login**: Valid PIN, wrong PIN, unknown user, missing fields, account lockout (5 failed attempts), locked account status (423)
- **Auth middleware**: Missing token, malformed token rejection

### `cows.test.js` (15 tests)

Cow CRUD operations:

- **GET /api/cows**: Unauthorized access, array response, search filtering (tag + name), status filtering, pagination
- **GET /api/cows/:id**: Single cow with sire_name/dam_name resolution, 404 for nonexistent
- **POST /api/cows**: Creation with 201, duplicate tag_number → 409, missing required fields → 400, invalid enum values → 400, permission enforcement
- **PUT /api/cows/:id**: Update with 200, 404 for nonexistent
- **DELETE /api/cows/:id**: Soft-delete (admin only), 403 for worker

### `medications.test.js` (12 tests)

Medication management:

- **GET /api/medications**: Active-only filtering by default, `?all=1` includes inactive, 401 without token
- **GET /api/medications/:id**: Single medication, 404 for nonexistent
- **POST /api/medications**: Creation with 201, 400 for missing required fields, 403 without permission
- **PUT /api/medications/:id**: Update with 200, 404 for nonexistent
- **DELETE /api/medications/:id**: Soft-deactivation (sets `is_active = false`), 404 for nonexistent

### `treatments.test.js` (19 tests)

Complex treatment logic with multi-medication support:

- **POST /api/treatments**:
  - Single medication creation
  - Multiple medications per treatment
  - Junction table persistence verification
  - Max withdrawal date calculation across all medications
  - Null withdrawal dates when no periods defined
  - Validation: empty medications array → 400, missing fields → 400, nonexistent cow → 404, inactive medication → 404
  - Transaction rollback on partial failure
- **GET /api/treatments**: List with medications array enrichment, cow_id filtering
- **GET /api/treatments/withdrawal**: Active milk withdrawals only, one entry per cow (latest)
- **GET /api/treatments/:id**: Single enriched treatment, 404 for nonexistent
- **DELETE /api/treatments/:id**: Hard delete with CASCADE to junction table (admin only), 403 for worker

### `analytics.test.js` (4 tests)

Analytics endpoints:

- **GET /api/analytics/herd-summary**: Total count + by_status breakdown, soft-deleted exclusion, sum validation, 401 without token
- **GET /api/analytics/unhealthiest**: Placeholder endpoint returning `[]` (TODO: implement when health_events table is added)

## Test Infrastructure

### Configuration

- **jest.config.js**: Node environment, in-memory SQLite, coverage paths
- **knexfile.js**: Added `test` environment with `:memory:` database
- **jest.setup.js**: Sets `NODE_ENV=test`, test JWT secret, disables rate limiting for tests

### Helpers

- **setup.js**: `seedUsers()` creates admin + worker with fixed UUIDs, low bcrypt cost (4) for speed
- **tokens.js**: `adminToken()` and `workerToken()` generate valid Bearer tokens matching seeded users

### Architecture

- **server/app.js**: Extracted Express app (no `.listen()`) for Supertest to import without binding a port
- **server/index.js**: Now only imports app and calls `.listen()`

## Running Tests

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Generate coverage report
```

## Key Test Patterns

1. **Isolation**: Each test file runs in its own worker with a fresh in-memory SQLite database
2. **Factories**: Helper functions (`createCow`, `createMedication`) simplify test data setup
3. **Token fixtures**: Pre-built admin/worker tokens match seeded users (no DB lookups needed)
4. **Edge cases**: Duplicate keys → 409, missing required fields → 400, nonexistent resources → 404, permission checks → 403
5. **Soft deletes**: Verified via `GET` endpoints no longer returning the resource
6. **Transaction safety**: Treatment creation rolls back if any medication insert would fail

## Uncovered Lines

Most uncovered lines are intentional:

- **app.js:33-35**: SPA static file serving (requires built client/dist/)
- **env.js:7**: Production JWT_SECRET check (only runs when `NODE_ENV=production`)
- **Migration down functions**: Rollback logic (not executed in normal test flow)
- **Error handler console.error**: Suppressed in tests via jest.setup.js

## Notes

- No test framework was installed before this — this is the initial test suite
- All 72 tests pass consistently in ~1.7s
- Tests follow the API conventions documented in CLAUDE.md
- Multi-medication treatment logic (Phase 4) is fully covered including junction table CASCADE delete
