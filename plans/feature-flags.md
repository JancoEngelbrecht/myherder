# Feature Flags Sub-Plan

> Parent: Phase 7 area (Admin Settings)
> Status: PLANNING

## Overview

Server-stored, admin-toggled, client-enforced module flags. Admins can enable/disable entire app modules from Settings. Flags sync across devices via API and are cached in IndexedDB for offline use. All 5 flags default to **enabled** on fresh install.

## Module Flags

| Flag key | Controls | Nav tab affected | Dashboard cards affected | CowDetail sections |
|---|---|---|---|---|
| `breeding` | Breeding hub, events, repro views, breed types admin | `breed` tab | "Breeding Hub" card | Reproduction section + breeding action btn |
| `milk_recording` | Milk recording view | `milk` tab | "Record Milk" card | — |
| `health_issues` | Health issues, issue logging, issue types admin | — | "Log Issue", "Open Issues" cards | Health Issues section |
| `treatments` | Treatments, withdrawal, medications admin | — | "Log Treatment", "Withdrawal" cards | Treatment History section + withdrawal badge |
| `analytics` | Analytics dashboard | — | "Analytics" card | — |

## Quality Gate — After Every Phase

Each phase ends with a mandatory quality checkpoint before proceeding:

1. **Run tests** — `cd client && npm run test:run` — all existing tests must pass
2. **Run lint** — `npm run lint` — no new warnings/errors introduced
3. **Dead code scan** — `npm run knip` — no new unused exports, files, or dependencies
4. **Self-review** — check for: redundant DB queries, duplicated patterns, proper error handling, no Vue reactive proxy leaks into IndexedDB, consistent naming
5. **Verify** — run the phase-specific verification steps listed in each phase
6. **Fix before proceeding** — any issues found must be resolved before starting the next phase

## Design Decisions

- **Client-side enforcement only** — no server middleware blocking API calls. This is a farm app, not multi-tenant SaaS. The API still works if called directly.
- **Server-stored** — `feature_flags` DB table + REST API. Cached in IndexedDB for offline. Admin sets once, all devices see the same config.
- **Log tab** (`/log`) — currently a placeholder. When built out, its entries should respect flags. For now, only Dashboard cards and direct routes are gated.
- **Withdrawal** gated by `treatments` flag (treatments own the withdrawal workflow).
- **Admin tool links** in Settings — conditionally shown based on their parent module flag (e.g., hide "Breed Types" admin link if breeding is off).

---

## Phase 1: Database Migration + API

**Migration 023** — `feature_flags` table:
```
key        VARCHAR(50) PRIMARY KEY
enabled    BOOLEAN NOT NULL DEFAULT true
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
```

Seed 5 rows (all `enabled: true`): `breeding`, `milk_recording`, `health_issues`, `treatments`, `analytics`.

**API route** — `server/routes/featureFlags.js`:
- `GET /api/feature-flags` — authenticated (any role). Returns `{ breeding: true, milkRecording: true, ... }` (camelCase keys).
- `PATCH /api/feature-flags` — admin only. Body: `{ breeding?: bool, milkRecording?: bool, ... }`. Updates matching rows, returns updated flags object.

**Mount** in `server/app.js`.

**Files:**
- [ ] `server/migrations/023_create_feature_flags.js`
- [ ] `server/routes/featureFlags.js`
- [ ] `server/app.js` — add route mount

**Verify:** `npm run migrate` succeeds, `curl` GET returns all 5 flags as true, PATCH toggles a flag.

**Quality gate:**
- Route follows `issueTypes.js` CRUD pattern (section dividers, top-level Joi schemas, no inline validation)
- No duplicated DB helper logic — reuse `getAllFlags()` helper for both GET and PATCH response
- Run `npm run lint` + `npm run knip` — no new issues

---

## Phase 2: Frontend Store + IndexedDB

**IndexedDB v9** — add `featureFlags` table (key: `key`, stores `{ key, enabled }`).

**Pinia store** — `client/src/stores/featureFlags.js`:
- State: `flags` reactive object `{ breeding: true, milkRecording: true, healthIssues: true, treatments: true, analytics: true }`
- `fetchFlags()` — GET API → update state + persist to IndexedDB. On API failure, load from IndexedDB. If neither available, use defaults (all true).
- `updateFlag(key, enabled)` — PATCH API → update state + IndexedDB.
- Computed getters: `isBreedingEnabled`, `isMilkRecordingEnabled`, etc. for clean template access.
- `hydrateFromCache()` — load from IndexedDB on app start (fast, before API completes).

**Load on auth** — call `featureFlagsStore.fetchFlags()` in auth store's `setSession()` (same pattern as breedTypes).

**Files:**
- [ ] `client/src/db/indexedDB.js` — bump to v9, add `featureFlags` table
- [ ] `client/src/stores/featureFlags.js` — new store
- [ ] `client/src/stores/auth.js` — import + call fetchFlags on login

**Verify:** Login → flags fetched and cached. Kill server → reload → flags load from IndexedDB.

**Quality gate:**
- Store follows `breedTypes.js` pattern (offline fallback, IndexedDB persistence, no reactive proxy leaks)
- No duplicate fetch logic — single `fetchFlags()` with cascading fallback (API → IndexedDB → defaults)
- Verify `{ ...obj }` spread before any `db.featureFlags.put()` call (DataCloneError prevention)
- Run full test suite — existing auth store tests must still pass after adding fetchFlags call
- Run `npm run knip` — no unused exports in new store

---

## Phase 3: Settings UI — Module Toggles

**New section** in `SettingsView.vue` — "Modules" section between Admin Tools and Data Sync:
- Each module flag rendered as a toggle row (flag name + description + switch)
- Toggle calls `featureFlagsStore.updateFlag(key, newValue)`
- Show loading state per toggle while API completes
- Admin-only section (the whole settings page is already admin-gated)

**Conditionally hide admin tool links** based on parent module:
- "Medications" link → `v-if="flags.treatments"`
- "Issue Types" link → `v-if="flags.healthIssues"`
- "Breed Types" link → `v-if="flags.breeding"`

**i18n keys** (en + af) — `featureFlags.sectionTitle`, `featureFlags.sectionDesc`, and per-flag: `featureFlags.breeding.name`, `featureFlags.breeding.desc`, etc.

**Files:**
- [ ] `client/src/views/admin/SettingsView.vue` — add modules section + conditional admin links
- [ ] `client/src/i18n/en.json` — featureFlags namespace
- [ ] `client/src/i18n/af.json` — featureFlags namespace
- [ ] `client/src/style.css` — toggle switch styles (global utility `.toggle-switch`)

**Verify:** Settings page shows 5 toggles. Toggling one updates the DB (check via API). Disabled module's admin link disappears.

**Quality gate:**
- Toggle component uses global `.toggle-switch` class — no duplicated inline styles
- i18n keys consistent across en.json and af.json (same key set, no missing translations)
- No hardcoded strings in template — all user-facing text through `t()`
- Admin links section doesn't leave an empty card shell when all 3 links are hidden — check with `v-if` on the section wrapper too
- Run lint + tests + knip

---

## Phase 4: Navigation + Route Gating

**BottomNav** — make `tabs` a computed property that filters based on `featureFlagsStore`:
- `milk` tab → `flags.milkRecording`
- `breed` tab → `flags.breeding`
- `home`, `cows`, `log` tabs always shown

**Router guards** — extend `router.beforeEach`:
- Add route meta: `requiresModule: 'breeding'` (etc.) on all module-specific routes
- In the guard: if `to.meta.requiresModule` and that flag is disabled → redirect to `/`
- Module-to-routes mapping:
  - `breeding`: `/breed`, `/breed/notifications`, `/breed/events`, `/breed/log`, `/breed/edit/:id`, `/cows/:id/repro`, `/admin/breed-types`
  - `milk_recording`: `/milk`
  - `health_issues`: `/health-issues`, `/log/issue`, `/cows/:id/issues`, `/issues/:id`, `/admin/issue-types`
  - `treatments`: `/log/treatment`, `/treatments/:id`, `/cows/:id/treatments`, `/withdrawal`, `/admin/medications`
  - `analytics`: `/analytics`

**DashboardView** — wrap action cards with `v-if`:
- "Analytics" → `flags.analytics`
- "Log Treatment" → `flags.treatments`
- "Log Issue" → `flags.healthIssues`
- "Withdrawal" → `flags.treatments`
- "Record Milk" → `flags.milkRecording`
- "Breeding Hub" → `flags.breeding`

**Files:**
- [ ] `client/src/components/organisms/BottomNav.vue` — computed filtered tabs
- [ ] `client/src/router/index.js` — add `requiresModule` meta + guard logic
- [ ] `client/src/views/DashboardView.vue` — conditional action cards

**Verify:** Disable breeding → breed tab gone, `/breed` redirects to `/`, dashboard card hidden. Same for each module.

**Quality gate:**
- Router guard is a single clean check — no nested if/else chain per module. Use `requiresModule` meta + flags store lookup
- BottomNav `tabs` computed doesn't re-create array on every render — verify reactivity is efficient
- Dashboard doesn't leave visual gaps when cards are hidden — check grid/flex layout still flows naturally
- Test each flag independently: disable one at a time, verify only that module's routes/nav/cards disappear
- Run lint + tests + knip

---

## Phase 5: Detail View Gating + API Call Optimization

**CowDetailView** — conditional sections and skip unnecessary API calls:
- Reproduction section + breeding action btn → `v-if="flags.breeding"`
- Health Issues section → `v-if="flags.healthIssues"`
- Treatment History section + withdrawal badge → `v-if="flags.treatments"`
- In `load()`: skip `breedingEventsStore.fetchForCow()` if breeding disabled, skip `treatmentsStore.fetchByCow()` if treatments disabled, skip `healthIssuesStore.fetchByCow()` if healthIssues disabled.

**Files:**
- [ ] `client/src/views/CowDetailView.vue` — conditional sections + conditional API calls

**Verify:** Disable health issues → cow detail page loads without health section, no health API call made (check network tab).

**Quality gate:**
- No leftover empty card containers when sections are hidden — use `v-if` not `v-show`
- API call skipping is clean — no try/catch wrapping already-skipped calls
- Verify CowDetailView still loads correctly with ALL flags disabled (edge case — cow page should still show core cow info)
- Run lint + tests + knip

---

## Phase 6: i18n + Tests

**Tests** — `client/src/tests/featureFlags.store.test.js`:
- Fetches flags from API and persists to IndexedDB
- Falls back to IndexedDB when API fails
- Falls back to defaults when both fail
- updateFlag calls PATCH and updates state
- Integration with auth store (fetchFlags called on login)

**BottomNav test updates** — verify tabs are filtered when flags change.

**Files:**
- [ ] `client/src/tests/featureFlags.store.test.js` — new test file
- [ ] `client/src/tests/BottomNav.test.js` — add flag-based filtering tests

**Verify:** `cd client && npm run test:run` — all tests pass.

**Quality gate (final):**
- New tests follow project patterns — `featureFlags.store.test.js` uses mocked IndexedDB pattern (see `healthIssues.store.test.js`)
- BottomNav test additions use the same test setup as existing `BottomNav.test.js`
- No test duplication — each test covers one specific behavior
- Full suite green: `cd client && npm run test:run`
- Final lint + knip clean: `npm run lint` + `npm run knip`
- Build check: `npm run build` — no build errors from new code
- Review all changed files for: unused imports, console.log leftovers, TODO comments, hardcoded strings

---

## Phase Summary

| Phase | What | Key files | Effort |
|---|---|---|---|
| 1 | DB migration + API | migration, route, app.js | Small |
| 2 | Pinia store + IndexedDB | store, indexedDB, auth | Small |
| 3 | Settings UI toggles | SettingsView, i18n, style.css | Medium |
| 4 | Nav + route gating | BottomNav, router, Dashboard | Medium |
| 5 | Detail view gating | CowDetailView | Small |
| 6 | Tests | 2 test files | Small |
