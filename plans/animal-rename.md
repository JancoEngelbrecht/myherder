# Universal Animal Rename Plan

> Rename all "cow" references to "animal" across the entire stack: DB, API, frontend, tests, i18n.

## Scope

**In scope:**

- Rename DB table `cows` → `animals` (migration 038)
- Rename FK column `cow_id` → `animal_id` in all related tables
- Rename API endpoint `/api/cows` → `/api/animals`
- Rename permission `can_manage_cows` → `can_manage_animals`
- Rename backend route file `cows.js` → `animals.js`
- Rename all response fields: `cow_name` → `animal_name`, `cow_status` → `animal_status`, `cow_count` → `animal_count`
- Rename frontend store `cows.js` → `animals.js` (`useCowsStore` → `useAnimalsStore`)
- Rename all Cow* component/view/test files → Animal*
- Rename router paths `/cows/*` → `/animals/*` and route names `cow-*` → `animal-*`
- Rename IndexedDB table `cows` → `animals` (version bump to 12)
- Update sync engine entity type `cows` → `animals`
- Rename CSS classes `.cow-*` → `.animal-*`
- Rename constants `COW_STATUSES` → `ANIMAL_STATUSES`
- Clean up legacy i18n keys that still say "cow"
- Update data-tour attributes
- Rebuild `client/dist`

**Out of scope:**

- Renaming internal variables like `cow` in loop bodies — too granular, zero user/developer value
- Renaming `sire_id`/`dam_id` columns — species-correct breeding terms
- Renaming `computeLifePhase` or `computeIsReadyToBreed` — already species-agnostic
- Changing seed data variable names — only run once, no ongoing impact
- Changing migration file names — immutable history
- Changing plan/doc files — historical artifacts

**Assumptions:**

- Production can be taken offline briefly for the DB migration
- No other branches have in-flight work that would conflict
- The sync entity type change needs backward compatibility for queued offline changes
- `client/dist` will be rebuilt after all frontend changes

**What already exists:**

- `useSpeciesTerms` composable — already provides species-aware labels to UI
- `animals`/`animalForm`/`animalDetail` i18n namespaces — already used by views
- `species` store + `speciesCode` in JWT — already deployed

---

## Phase 1: Database Migration (038)

- [ ] **1.1 Create migration 038** — Rename `cows` → `animals` table, rename `cow_id` → `animal_id` in treatments/health_issues/milk_records/breeding_events, update `can_manage_cows` → `can_manage_animals` in users.permissions JSON
  - Complexity: L
  - Files: `server/migrations/038_rename_cows_to_animals.js`
  - Depends on: nothing
  - Verify: `npm run migrate` succeeds; all tables/columns renamed; permissions JSON updated

- [ ] **1.2 Update constants** — `COW_STATUSES` → `ANIMAL_STATUSES`
  - Complexity: S
  - Files: `server/helpers/constants.js` + all importers
  - Depends on: nothing
  - Verify: grep for `COW_STATUSES` returns 0 hits

---

## Phase 2: Backend Route Rename

- [ ] **2.1 Rename cows route file** — `server/routes/cows.js` → `server/routes/animals.js`, update all internal `db('cows')` → `db('animals')`, schema names, `findCowOrFail` → `findAnimalOrFail`, permission refs
  - Complexity: M
  - Files: `server/routes/animals.js` (renamed)
  - Depends on: Phase 1
  - Verify: route file has zero "cow" references in table/column names

- [ ] **2.2 Update app.js** — Mount at `/api/animals` + keep `/api/cows` as temporary redirect alias
  - Complexity: S
  - Files: `server/app.js`
  - Depends on: 2.1
  - Verify: both `/api/animals` and `/api/cows` respond

- [ ] **2.3 Update related route files** — All files that JOIN/query the `cows` table or use `cow_id`/`cow_name`/`cow_status`: breedingEvents, healthIssues, milkRecords, treatments, export, farms, sync, breedTypes
  - Complexity: L
  - Files: 8 route files
  - Depends on: Phase 1
  - Verify: grep `db('cows')` and `cow_id` in routes/ returns 0 hits (except sync backward compat)

- [ ] **2.4 Update analytics routes** — structure, health, fertility, financial, kpi, helpers
  - Complexity: M
  - Files: 6 files in `server/routes/analytics/`
  - Depends on: Phase 1
  - Verify: grep `cow_id` in analytics/ returns 0 hits

- [ ] **2.5 Update report routes** — treatment, production, herd
  - Complexity: M
  - Files: 3 files in `server/routes/reports/`
  - Depends on: Phase 1
  - Verify: grep `cow_id` in reports/ returns 0 hits

- [ ] **2.6 Update services** — syncService.js entity map (`cows` → `animals`, keep `cows` as backward compat alias), withdrawalService.js
  - Complexity: S
  - Files: `server/services/syncService.js`, `server/services/withdrawalService.js`
  - Depends on: Phase 1
  - Verify: sync push with entity `'animals'` works; legacy `'cows'` still accepted

- [ ] **2.7 Update backend helpers** — `breedingSchemas.js`, `breedingCalc.js` if they reference cow table/columns
  - Complexity: S
  - Files: `server/helpers/breedingSchemas.js`, `server/helpers/breedingCalc.js`
  - Depends on: Phase 1
  - Verify: grep `cow` in helpers/ returns only constants.js export name

- [ ] **2.8 Update users route** — Permission constant `can_manage_cows` → `can_manage_animals`
  - Complexity: S
  - Files: `server/routes/users.js`
  - Depends on: Phase 1
  - Verify: ALL_PERMISSIONS array contains `can_manage_animals`

- [ ] **2.9 Update farms route** — `cow_count` → `animal_count` in response, permission in seed
  - Complexity: S
  - Files: `server/routes/farms.js`
  - Depends on: Phase 1
  - Verify: GET /api/farms returns `animal_count` field

---

## Phase 3: Backend Tests

- [ ] **3.1 Rename cows test file** — `server/tests/cows.test.js` → `server/tests/animals.test.js`, update all endpoint URLs, helper names, field refs
  - Complexity: M
  - Files: `server/tests/animals.test.js` (renamed)
  - Depends on: Phase 2
  - Verify: test file runs with 0 failures

- [ ] **3.2 Update other backend test files** — All files referencing `/api/cows`, `cow_id`, `can_manage_cows`, or `cow_count`: breedingEvents, treatments, healthIssues, milkRecords, farms, export, users, auditService, tenantIsolation, permissions, sync
  - Complexity: L
  - Files: ~11 test files
  - Depends on: Phase 2
  - Verify: grep `api/cows` in tests/ returns 0 hits

- [ ] **3.3 Update test helpers** — `setup.js` and `tokens.js` permission refs
  - Complexity: S
  - Files: `server/tests/helpers/setup.js`, `server/tests/helpers/tokens.js`
  - Depends on: Phase 2
  - Verify: grep `can_manage_cows` in tests/ returns 0 hits

- [ ] **3.4 Update analytics tests** — 5 files
  - Complexity: M
  - Files: `server/tests/analytics/*.test.js`
  - Depends on: Phase 2
  - Verify: all analytics tests pass

- [ ] **3.5 Run full backend test suite** — All 732+ tests must pass
  - Complexity: S
  - Files: none
  - Depends on: 3.1–3.4
  - Verify: `npm test` exits 0

---

## Phase 4: Frontend Store + IndexedDB + Sync

- [ ] **4.1 Rename cows store** — `client/src/stores/cows.js` → `animals.js`, rename export to `useAnimalsStore`, update API URLs `/cows` → `/animals`, update IndexedDB refs `db.cows` → `db.animals`
  - Complexity: M
  - Files: `client/src/stores/animals.js` (renamed)
  - Depends on: Phase 2
  - Verify: store exports `useAnimalsStore`; all API calls use `/animals`

- [ ] **4.2 Update IndexedDB schema** — Rename table `cows` → `animals`, rename `cow_id` → `animal_id` in index definitions, bump to version 12
  - Complexity: S
  - Files: `client/src/db/indexedDB.js`
  - Depends on: nothing
  - Verify: schema shows `animals` table; version is 12

- [ ] **4.3 Update auth store** — `canManageCows` → `canManageAnimals`, permission string
  - Complexity: S
  - Files: `client/src/stores/auth.js`
  - Depends on: nothing
  - Verify: grep `can_manage_cows` in stores/ returns 0 hits

- [ ] **4.4 Update related stores** — All stores referencing `cow_id`: treatments.js, healthIssues.js, milkRecords.js, breedingEvents.js
  - Complexity: M
  - Files: 4 store files
  - Depends on: 4.2
  - Verify: grep `cow_id` in stores/ returns 0 hits

- [ ] **4.5 Update sync store** — If it references entity type `cows`
  - Complexity: S
  - Files: `client/src/stores/sync.js`
  - Depends on: nothing
  - Verify: entity type uses `'animals'`

---

## Phase 5: Frontend Components + Views

- [ ] **5.1 Rename CowCard** — `CowCard.vue` → `AnimalCard.vue`, update CSS classes `.cow-*` → `.animal-*`
  - Complexity: S
  - Files: `client/src/components/organisms/AnimalCard.vue` (renamed)
  - Depends on: Phase 4
  - Verify: component renders correctly

- [ ] **5.2 Rename CowSearchDropdown** — → `AnimalSearchDropdown.vue`, update API URLs
  - Complexity: S
  - Files: `client/src/components/molecules/AnimalSearchDropdown.vue` (renamed)
  - Depends on: Phase 4
  - Verify: dropdown fetches from `/animals`

- [ ] **5.3 Rename all 6 Cow\* views** — CowListView → AnimalListView, CowDetailView → AnimalDetailView, CowFormView → AnimalFormView, CowReproView → AnimalReproView, CowIssueHistoryView → AnimalIssueHistoryView, CowTreatmentHistoryView → AnimalTreatmentHistoryView. Update imports, store refs, router pushes, `cow_id` → `animal_id`
  - Complexity: L
  - Files: 6 view files (renamed)
  - Depends on: Phase 4
  - Verify: all views render; no `Cow` in component names

- [ ] **5.4 Update other views** — All views importing CowCard/CowSearchDropdown/useCowsStore or using `cow_id` params: LogBreedingView, LogIssueView, LogTreatmentView, MilkRecordingView, MilkHistoryView, BreedingHubView, BreedingEventsView, BreedingNotificationsView, WithdrawalListView, DashboardView, IssueDetailView, TreatmentDetailView, OpenIssuesView
  - Complexity: L
  - Files: ~13 view files
  - Depends on: 5.1, 5.2, Phase 4
  - Verify: grep `CowCard\|CowSearch\|useCowsStore\|cow_id` in views/ returns 0 hits

- [ ] **5.5 Update router** — Paths `/cows/*` → `/animals/*`, route names `cow-*` → `animal-*`, component imports, permission ref. Add redirects from old `/cows/*` paths
  - Complexity: M
  - Files: `client/src/router/index.js`
  - Depends on: 5.3
  - Verify: all routes use `/animals`; old `/cows` paths redirect

- [ ] **5.6 Update analytics CSS** — `.cow-*` → `.animal-*` in `client/src/assets/analytics.css`
  - Complexity: S
  - Files: `client/src/assets/analytics.css`
  - Depends on: nothing
  - Verify: grep `.cow-` in CSS returns 0 hits

- [ ] **5.7 Update data-tour attributes** — `cow-*` → `animal-*` in affected views
  - Complexity: S
  - Files: ~3 files
  - Depends on: 5.3
  - Verify: grep `data-tour="cow` returns 0 hits

- [ ] **5.8 Update UserManagement** — Permission string display
  - Complexity: S
  - Files: `client/src/views/admin/UserManagement.vue`
  - Depends on: nothing
  - Verify: permission list shows `can_manage_animals`

---

## Phase 6: Frontend Tests + i18n

- [ ] **6.1 Rename Cow\* test files** — All 9 → Animal\*, update imports, API mocks, store refs
  - Complexity: L
  - Files: 9 test files (renamed)
  - Depends on: Phase 5
  - Verify: all renamed tests pass

- [ ] **6.2 Update other test files** — ~15 test files referencing cow store/components/endpoints
  - Complexity: L
  - Files: ~15 test files
  - Depends on: Phase 5
  - Verify: grep `CowCard\|useCowsStore\|/api/cows\|cow_id` in tests/ returns 0 hits

- [ ] **6.3 Clean up i18n** — Rename remaining `cows.*`, `cowForm.*`, `cowDetail.*`, `cowCard.*` keys in both en.json and af.json. Update `nav.cows` → `nav.animals`. Remove duplicate legacy namespaces
  - Complexity: M
  - Files: `client/src/i18n/en.json`, `client/src/i18n/af.json`
  - Depends on: Phase 5
  - Verify: grep `"cows"` and `"cowForm"` and `"cowDetail"` as top-level keys returns 0 hits

- [ ] **6.4 Run full frontend test suite** — All 726+ tests must pass
  - Complexity: S
  - Files: none
  - Depends on: 6.1–6.3
  - Verify: `cd client && npm run test:run` exits 0

---

## Phase 7: Finalize

- [ ] **7.1 Sync backward compat** — Accept both `cows` and `animals` entity types in push schema for 1 release cycle
  - Complexity: S
  - Files: `server/routes/sync.js`, `server/services/syncService.js`
  - Depends on: Phase 2
  - Verify: push with `entityType: 'cows'` still succeeds

- [ ] **7.2 Remove /api/cows alias** — Or keep as permanent redirect (decision: temporary, remove after 1 release)
  - Complexity: S
  - Files: `server/app.js`
  - Depends on: Phase 3 passing
  - Verify: `/api/cows` returns 301 redirect or 404

- [ ] **7.3 Update seed files** — `001_initial_data.js`, `003_demo_analytics.js`, `004_video_demo.js` — table name + column refs
  - Complexity: M
  - Files: 3 seed files
  - Depends on: Phase 1
  - Verify: `npm run seed` succeeds on fresh DB

- [ ] **7.4 Update CLAUDE.md** — All cow references in API documentation
  - Complexity: M
  - Files: `CLAUDE.md`
  - Depends on: all phases
  - Verify: grep `cow` in CLAUDE.md returns only historical/out-of-scope refs

- [ ] **7.5 Rebuild client/dist**
  - Complexity: S
  - Files: `client/dist/`
  - Depends on: all frontend phases
  - Verify: `npm run build` succeeds

- [ ] **7.6 Run full test suite** — Backend + frontend
  - Complexity: S
  - Files: none
  - Depends on: all phases
  - Verify: both suites exit 0

- [ ] **7.7 Update MEMORY.md** — File map and references
  - Complexity: S
  - Files: `MEMORY.md`, memory files
  - Depends on: all phases
  - Verify: file map accurate

---

## Architecture

```
                    RENAME FLOW (top-down)

  ┌──────────────────────────────────────────────┐
  │  Migration 038                                │
  │  cows → animals (table)                       │
  │  cow_id → animal_id (FK columns x4)           │
  │  can_manage_cows → can_manage_animals (perms)  │
  └──────────────┬───────────────────────────────┘
                 │
  ┌──────────────▼───────────────────────────────┐
  │  Backend Routes (13 route files)              │
  │  /api/cows → /api/animals                     │
  │  db('cows') → db('animals')                   │
  │  cow_id → animal_id (queries)                 │
  │  cow_name → animal_name (response fields)     │
  └──────────────┬───────────────────────────────┘
                 │
  ┌──────────────▼───────────────────────────────┐
  │  Frontend (stores, views, components)         │
  │  useCowsStore → useAnimalsStore               │
  │  /cows → /animals (router)                    │
  │  CowCard → AnimalCard                         │
  │  db.cows → db.animals (IndexedDB)             │
  └──────────────┬───────────────────────────────┘
                 │
  ┌──────────────▼───────────────────────────────┐
  │  Sync Engine (backward compat)                │
  │  Accept 'cows' OR 'animals' in push           │
  │  Pull returns 'animals' key                   │
  └──────────────────────────────────────────────┘
```

### Key Decisions

- **Table rename via migration (not alias):** Clean break. SQLite `ALTER TABLE RENAME`. MySQL too. Single migration.
- **Temporary API alias:** Mount `/api/cows` as redirect for 1 release. Remove after.
- **Sync backward compat:** Accept `'cows'` as alias for `'animals'` in push for 1 release cycle.
- **IndexedDB version bump to v12:** Dexie handles schema migration. Existing cache cleared (acceptable).
- **Permission rename in migration:** Parse + rewrite JSON in users.permissions column.
- **No new abstractions:** Purely mechanical rename.

---

## Test Matrix

| Codepath / Flow         | Happy path        | Error path            | Edge case       | Test exists? |
| ----------------------- | ----------------- | --------------------- | --------------- | ------------ |
| GET /api/animals        | List with filters | 401 unauthorized      | Empty farm      | [x] rename   |
| POST /api/animals       | Create animal     | Validation, 403       | Duplicate tag   | [x] rename   |
| PUT /api/animals/:id    | Update            | Not found, wrong farm | FK update       | [x] rename   |
| DELETE /api/animals/:id | Soft delete       | Not admin             | Already deleted | [x] rename   |
| Sync push 'animals'     | Creates animal    | Invalid type          | -               | [x] update   |
| Sync push legacy 'cows' | Still works       | -                     | -               | [ ] **NEW**  |
| Sync pull 'animals' key | Includes array    | -                     | -               | [x] update   |
| can_manage_animals      | Worker POST ok    | 403 without           | -               | [x] rename   |
| Migration rollback      | Restores cows     | -                     | -               | [ ] manual   |
| IndexedDB v12           | Animals table ok  | Corrupt → recovery    | -               | [x] existing |
| Router /animals/\*      | Navigate ok       | Unknown ID            | -               | [x] rename   |
| Legacy /cows redirect   | → /animals        | -                     | -               | [ ] **NEW**  |

---

## Failure Modes

| Codepath              | Failure scenario                     | Covered? | Error handling? | Silent?              |
| --------------------- | ------------------------------------ | -------- | --------------- | -------------------- |
| Migration 038         | Malformed permissions JSON           | No       | **Needs guard** | Yes — CRITICAL       |
| Sync push 'cows'      | Queued offline changes with old type | No → NEW | Needs alias     | Yes — CRITICAL       |
| Router /cows bookmark | User has old bookmark                | No       | Needs redirect  | Yes — needs redirect |
| IndexedDB upgrade     | Browser blocks version               | Yes      | Yes (recovery)  | No                   |

Critical gaps addressed in plan:

1. Migration must try/catch JSON parse on permissions
2. Sync accepts 'cows' alias for 1 release
3. Router redirects /cows/_ → /animals/_

---

## Performance

- No performance impact — purely rename
- DB table rename is O(1) metadata operation (both SQLite and MySQL)
- Column rename may require table rebuild in SQLite (small tables, acceptable)
- No new queries, indexes, or patterns
