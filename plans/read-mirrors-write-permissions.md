# Read-Mirrors-Write Permission Enforcement

Workers can only see data for features they have permission to use. All GET routes mirror the write permission model.

## Scope

**In scope:**

- Backend: Add `authorize()` to all GET routes that currently lack permission checks
- Backend: Filter sync pull by user permissions (omit keys for unpermitted entities)
- Backend: Gate `?all=1` on issue-types/breed-types behind admin
- Frontend: Hide CowDetailView sections by permission
- Frontend: Gate dashboard herd summary behind `can_view_analytics`
- Frontend: Handle missing keys in sync pull responses
- Tests: Permission-denied test cases + `workerTokenWith()` helper
- Rebuild `client/dist`

**Out of scope:**

- Feature flag server-side enforcement (separate concern)
- New permissions (e.g. separate read vs write permissions)
- `can_manage_cows` changes (already working correctly)
- Frontend route changes (already well-gated in router)

---

## Phase 1: Backend GET Route Gating

### Task 1.1 — Milk Records GET routes `(S)`

- **File:** `server/routes/milkRecords.js`
- Add `authorize('can_record_milk')` to:
  - `GET /` (line 102)
  - `GET /recorders` (line 142)
  - `GET /summary` (line 156)
  - `GET /:id` (line 199)
- Pattern: `router.get('/', authorize('can_record_milk'), async (req, res, next) => {`
- **Verify:** Worker without `can_record_milk` gets 403 on all 4 GET endpoints

### Task 1.2 — Treatments GET routes `(S)`

- **File:** `server/routes/treatments.js`
- Add `authorize('can_log_treatments')` to:
  - `GET /` (line 108)
  - `GET /withdrawal` (line 157)
  - `GET /:id` (line 222)
- **Verify:** Worker without `can_log_treatments` gets 403 on all 3 GET endpoints

### Task 1.3 — Health Issues GET routes `(S)`

- **File:** `server/routes/healthIssues.js`
- Add `authorize('can_log_issues')` to:
  - `GET /` (line 67)
  - `GET /:id` (line 103)
  - `GET /:id/comments` (line 202)
- **Verify:** Worker without `can_log_issues` gets 403 on all 3 GET endpoints

### Task 1.4 — Breeding Events GET routes `(S)`

- **File:** `server/routes/breedingEvents.js`
- Add `authorize('can_log_breeding')` to:
  - `GET /upcoming` (line 75)
  - `GET /` (line 163)
  - `GET /:id` (line 226)
- **Verify:** Worker without `can_log_breeding` gets 403 on all 3 GET endpoints

### Task 1.5 — Medications GET routes `(S)`

- **File:** `server/routes/medications.js`
- Add `authorize('can_log_treatments')` to:
  - `GET /` (line 36)
  - `GET /:id` (line 74)
- Rationale: Medications are only needed by workers who log treatments. Medication writes remain gated by `can_manage_medications` (admin management permission).
- **Verify:** Worker without `can_log_treatments` gets 403 on both GET endpoints

---

## Phase 2: Admin-Only Fix for `?all=1` `(S)`

### Task 2.1 — Gate `?all=1` behind admin

- **Files:** `server/routes/issueTypes.js` (line 37), `server/routes/breedTypes.js` (line 43)
- If `req.query.all === '1'` and user is not admin, silently ignore the flag (treat as `all=0`)
- Pattern: `const showAll = req.query.all === '1' && (req.user.role === 'admin' || req.user.role === 'super_admin')`
- **Verify:** Worker with `?all=1` only sees active records. Admin still sees all.

---

## Phase 3: Sync Pull Filtering `(M)`

### Task 3.1 — Filter pullData by user permissions

- **File:** `server/routes/sync.js` (line 109)
  - Pass `req.user` to `pullData()`: `pullData(value.since, value.full === '1', req.farmId, req.user)`
- **File:** `server/services/syncService.js` — `pullData()` function (line 289)
  - Add `user` parameter
  - Build permission-to-entity mapping:
    - Always included (reference data): `cows`, `breedTypes`, `issueTypes`
    - `milkRecords` → requires `can_record_milk`
    - `treatments` → requires `can_log_treatments`
    - `medications` → requires `can_log_treatments`
    - `healthIssues` → requires `can_log_issues`
    - `breedingEvents` → requires `can_log_breeding`
    - Admin/super_admin → all entities (bypass)
  - Filter `ENTITY_MAP` entries to only permitted entities before querying
  - **Omit keys entirely** for unpermitted entities (do NOT return empty arrays)
- **Verify:** Worker with only `can_record_milk` gets `{ cows, breedTypes, issueTypes, milkRecords, deleted, syncedAt }` — no treatments, healthIssues, breedingEvents, or medications keys

### Task 3.2 — Frontend: verify sync pull handles missing keys

- **File:** `client/src/services/syncManager.js` (line 157-173) — this is where pull response is consumed (NOT `stores/sync.js`)
- The existing code at line 169 already guards with `if (records?.length)` — the optional chaining (`?.`) means `undefined?.length` evaluates to `undefined` (falsy), so missing keys are silently skipped. No IndexedDB wipe occurs for omitted entities.
- **No code change needed** — just verify with a manual test or unit test that a sync pull with missing keys completes without errors.
- **Verify:** Worker with limited permissions completes sync without errors or console warnings

---

## Phase 4: Frontend Permission Gating `(S)`

### Task 4.1 — CowDetailView section visibility + API call gating

- **File:** `client/src/views/CowDetailView.vue`
- **Template:** Add `hasPermission` checks to existing `v-if` conditions:
  - Reproduction section (line 144): `v-if="flags.breeding && cow.sex !== 'male' && authStore.hasPermission('can_log_breeding')"`
  - Health Issues section (line 177): `v-if="flags.healthIssues && authStore.hasPermission('can_log_issues')"`
  - Treatments section (line 208): `v-if="flags.treatments && authStore.hasPermission('can_log_treatments')"`
  - Breeding action button (line 241): `v-if="flags.breeding && cow.sex !== 'male' && authStore.hasPermission('can_log_breeding')"`
- **Script `load()` function (line 366-379):** Also guard the background API calls behind permission checks — without this, the stores will fire 403 requests after Phase 1 adds `authorize()` to GET routes:
  - Line 368: `if (featureFlagsStore.flags.treatments && authStore.hasPermission('can_log_treatments')) {`
  - Line 371: `if (featureFlagsStore.flags.healthIssues && authStore.hasPermission('can_log_issues')) {`
  - Line 374: `if (featureFlagsStore.flags.breeding && cow.value.sex !== 'male' && authStore.hasPermission('can_log_breeding')) {`
- Use `authStore.hasPermission()` (already imported via `authStore`)
- **Verify:** Worker without breeding permission doesn't see repro section AND no 403 API calls fire. Same for treatments/issues.

### Task 4.2 — Dashboard herd summary template gating

- **File:** `client/src/views/DashboardView.vue`
- The script already skips the API call when `!hasPermission('can_view_analytics')` (line 189). No script change needed.
- **Template only:** Add permission check to stats row `v-if` (line 52): `v-if="!summaryLoading && hasPermission('can_view_analytics')"` — currently shows "—" dashes for unpermitted workers, which is confusing.
- **Verify:** Worker without `can_view_analytics` sees no stats row. No failed API call (already handled).

---

## Phase 5: Test Updates `(M)`

### Task 5.1 — Add `workerTokenWith()` helper

- **File:** `server/tests/helpers/tokens.js`
- Add function `workerTokenWith(permissions)` that creates a JWT with only the specified permissions
- Existing `workerToken()` unchanged (has all permissions, used by existing tests)
- Pattern:
  ```js
  function workerTokenWith(permissions = []) {
    const payload = { ...workerPayload, permissions }
    return `Bearer ${jwt.sign(payload, jwtSecret, { expiresIn: '1h' })}`
  }
  ```

### Task 5.2 — Backend permission-denied tests

- Add 1 test per route file: "GET / returns 403 for worker without permission"
  - `server/tests/milkRecords.test.js` — worker without `can_record_milk`
  - `server/tests/treatments.test.js` — worker without `can_log_treatments`
  - `server/tests/healthIssues.test.js` — worker without `can_log_issues`
  - `server/tests/breedingEvents.test.js` — worker without `can_log_breeding`
  - `server/tests/medications.test.js` — worker without `can_log_treatments`
- Each test uses `workerTokenWith([])` (no permissions) and expects 403

### Task 5.3 — Sync pull filtering test

- **File:** `server/tests/sync.test.js`
- Add test: "pull filters entities by worker permissions"
- Use `workerTokenWith(['can_record_milk'])` → response should have `cows`, `milkRecords`, `breedTypes`, `issueTypes` but NOT `treatments`, `healthIssues`, `breedingEvents`, `medications`

### Task 5.4 — Frontend CowDetailView test

- **File:** `client/src/tests/CowDetailView.test.js`
- Add test: "hides treatment section when worker lacks can_log_treatments"
- Add test: "hides health issues section when worker lacks can_log_issues"

---

## Phase 6: Build & Docs `(S)`

### Task 6.1 — Rebuild client/dist

- Run `cd client && npm run build`
- Commit updated dist

### Task 6.2 — Update CLAUDE.md

- Add note to API Conventions: "All GET routes require the same permission as their corresponding write routes (read-mirrors-write model)"
- Update relevant endpoint docs if needed

### Task 6.3 — Update MEMORY.md

- Add phase status entry for this plan
- Link sub-plan

---

## Permission Matrix (final state)

| Entity                      | GET permission                            | POST/PUT/DELETE permission                            |
| --------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Cows                        | _any authenticated_                       | `can_manage_cows` (POST/PUT), `requireAdmin` (DELETE) |
| Milk Records                | `can_record_milk`                         | `can_record_milk`                                     |
| Treatments                  | `can_log_treatments`                      | `can_log_treatments`                                  |
| Health Issues               | `can_log_issues`                          | `can_log_issues`                                      |
| Breeding Events             | `can_log_breeding`                        | `can_log_breeding`                                    |
| Medications                 | `can_log_treatments`                      | `can_manage_medications`                              |
| Analytics                   | `can_view_analytics`                      | n/a (read-only)                                       |
| Issue Types                 | _any authenticated_ (`?all=1` admin-only) | `requireAdmin`                                        |
| Breed Types                 | _any authenticated_ (`?all=1` admin-only) | `requireAdmin`                                        |
| Sync Pull                   | filtered by permissions                   | filtered by permissions                               |
| Users/Settings/Export/Audit | `requireAdmin`                            | `requireAdmin`                                        |

## Risk Assessment

- **Low risk:** Phase 1-2 are additive middleware. Admin/super_admin tokens auto-bypass `authorize()`, so all existing tests pass unchanged.
- **Medium risk:** Phase 3 (sync filtering) — omitting keys requires frontend guards. Task 3.2 handles this.
- **No migration needed** — all changes are code-only.
