# Frontend Animal Rename Completion

> Finish the `cow_id` → `animal_id` rename on the frontend. Backend + DB + store layer are already on `animal_id` (migration 038 / `plans/animal-rename.md` COMPLETE). This plan cleans up the leftover frontend references that were missed.

## Step 0 — Scope Challenge

### What already exists

- Backend: fully renamed. All Joi schemas require `animal_id`; all GET responses return `animal_id` (no `cow_id` fallback).
- Store layer: `breedingEvents.ts`, `treatments.ts`, `healthIssues.ts`, `milkRecords.ts` all operate on `animal_id`.
- IndexedDB: schema v12 already on `animal_id` (verified — `client/src/db/indexedDB.ts:39` is just a history comment).
- i18n: `animals`/`animalForm`/`animalDetail` namespaces already in place.
- 3 critical payload bugs fixed in the previous conversation turn:
  - `LogTreatmentView.vue:392` — payload now sends `animal_id`
  - `LogIssueView.vue:235` — payload now sends `animal_id`
  - `BreedingNotificationsView.vue` — `acceptDryOff` payload + 7 template bindings fixed
  - `LogBreedingView.vue` — payload + load fixed with `animal_id ?? cow_id` fallback

### Minimum viable change set

27 files still reference `cow_id` (110 occurrences total). They fall into 4 categories:

1. **Silent runtime bugs** (5 views) — reading `item.cow_id` on objects that only have `animal_id`. RouterLinks resolve to `/animals/undefined`; filters silently match nothing.
2. **Outgoing API param bugs** (2 views) — sending `?cow_id=` to endpoints that now expect `?animal_id=`.
3. **Stale local field names** (form state, loop vars) — internal, not user-visible, but confusing and one (`LogBreedingView:342`) causes a broken preg-check prefill.
4. **Test fixtures + hotfix fallbacks** — need to follow the production code.

Minimum: ~18 production files + ~11 test files. No new abstractions.

### Complexity check

Touches 29 files but it's purely mechanical — single-symbol replacement with surgical exceptions. No new patterns, classes, or services. Phases are atomically verifiable. Proceeding as-is.

### TODOS.md

Does not exist in this repo. No blocked work to sequence around.

---

## Step 1 — Scope Definition

### In scope

- Rename `cow_id` → `animal_id` (and related `cow*` identifiers that drift from the backend) across `client/src/views`, `client/src/components/molecules/BreedingEventCard.vue`, and `client/src/tests`.
- Fix the 5 silent-bug views where `item.cow_id` reads a non-existent field.
- Rename 2 outgoing query params (`/milk-records?cow_id=` and `/breeding-events?cow_id=`).
- Rename form fields (`form.cow_id` → `form.animal_id`) and error keys (`errors.cow_id` → `errors.animal_id`) in LogBreedingView, LogTreatmentView, LogIssueView.
- Rename `getCowIssues(cowId)` → `getAnimalIssues(animalId)` in healthIssues store (one call site).
- Rename `withdrawalCows` / `milkCows` / `meatCows` / `fetchByCow` / `loadingByCow` / `paginatedMilkCows` / `paginatedMeatCows` in treatments store + WithdrawalListView? **See decision D1 below** — this is borderline scope.
- Remove `created.animal_id ?? created.cow_id` hotfix fallback in `LogBreedingView.vue` once production payloads are verified on `animal_id`.
- Update all affected test fixtures so suites still pass.
- Update route query-param reads to accept `animal_id` canonically (keep a short-lived `cow_id` fallback for user bookmarks — see D2).

### Out of scope

- **Backend / migrations** — already done.
- **i18n key names** (`animals.*`, `animalForm.*`) — backend and stores already use the new namespaces.
- **Species-neutral display labels** like "cow" in English copy — the `useSpeciesTerms` composable already handles that.
- **Renaming `cows.js` store file** — already renamed to `animals.js`.
- **Renaming loop variables** like `(c) => ...` in `.filter((c) =>)` — zero user-visible impact, zero bug risk. Grep-and-replace would create noise and test churn.
- **Renaming CSS classes** like `.withdrawal-card`, `.cow-readonly`, `.alert-cow` — internal, not user-visible, not in backend contract. These are style selectors only.
- **`computeLifePhase` / `NON_MILKING_PHASES` constants** — already species-neutral.

### Assumptions

- No external callers bookmark `?cow_id=` URLs; the apps are PWA-scoped to authenticated users.
- `client/dist` is always rebuilt before any push to production (per `feedback_rebuild_dist.md`).
- Tests are authoritative — if a test is renamed and the new assertion catches the real bug, we trust the suite.
- All `cow_id` references in `.ts`/`.vue` source map cleanly to either (a) a backend response field, (b) a local variable, or (c) a test fixture. No generated code.

### What already exists

See Step 0. Also:

- `LogTreatmentView.vue:258` already accepts BOTH `route.query.cow_id || route.query.animal_id` as prefill source — proves the backward-compat pattern works.
- `LogIssueView.vue:161` has the same pattern.
- These two are our template for D2's router-query backward compat.

---

## Step 2 — Task Breakdown

Phases are ordered by risk. Each phase ends with `npm run lint` + `cd client && npm run test:run` passing. Phase 1 is the only one with user-visible bug fixes; the rest are cosmetic/test cleanup.

### Phase 1 — Silent runtime bug fixes (production-critical)

- [ ] **1.1 Fix `WithdrawalListView.vue` undefined router links**
  - Complexity: S
  - Files: `client/src/views/WithdrawalListView.vue`
  - What: 4 references to `item.cow_id` at lines 55, 61, 122, 130. The `/treatments/withdrawal` endpoint aggregates by `animal_id` (server/routes/treatments.ts:211), so every RouterLink currently navigates to `/animals/undefined`.
  - Replace `item.cow_id` → `item.animal_id` (4 occurrences).
  - Depends on: nothing
  - Verify: load the withdrawal page with a cow on withdrawal; click the view-link and confirm navigation lands on the correct animal detail page. Vitest `WithdrawalListView.test.ts` updated alongside.

- [ ] **1.2 Fix `IssueDetailView.vue` undefined router links**
  - Complexity: S
  - Files: `client/src/views/IssueDetailView.vue`
  - What: 2 references at lines 21, 151. `GET /api/health-issues/:id` returns `animal_id`; `issue.cow_id` is `undefined`. Both the cow-row link and the "log treatment" prefill URL are broken.
  - Replace `issue.cow_id` → `issue.animal_id` (2 occurrences).
  - Also confirm the generated URL `?animal_id=${issue.animal_id}` aligns with `LogTreatmentView`'s query prefill, which already accepts both.
  - Depends on: nothing
  - Verify: open an active issue, click the animal link, and click the "log treatment" CTA — both must target the real animal.

- [ ] **1.3 Fix `TreatmentDetailView.vue` undefined router link**
  - Complexity: S
  - Files: `client/src/views/TreatmentDetailView.vue`
  - What: line 21. `GET /api/treatments/:id` returns `animal_id`. Replace `treatment.cow_id` → `treatment.animal_id`.
  - Depends on: nothing
  - Verify: open any treatment detail → animal link works.

- [ ] **1.4 Fix `BreedingEventCard.vue` undefined click-through**
  - Complexity: S
  - Files: `client/src/components/molecules/BreedingEventCard.vue`
  - What: lines 148–149. `event.cow_id` → `event.animal_id`. Affects every breeding event card rendered in BreedingEventsView / per-animal repro views.
  - Depends on: nothing
  - Verify: click a breeding event card with `show-cow` → navigates correctly. Update `BreedingEventCard.test.ts` fixture.

- [ ] **1.5 Fix `LogBreedingView.vue` broken preg-check prefill**
  - Complexity: M
  - Files: `client/src/views/LogBreedingView.vue`
  - What: `findLatestInsemCalving` at line 342 filters `e.cow_id === cowId` on events returned from the breedingEvents store, which indexes on `animal_id` (verified at `stores/breedingEvents.ts:13`). Result: preg-check positive never pre-fills the calving date from the latest insemination, and `prefillSource` hint never shows.
  - Replace `e.cow_id` → `e.animal_id` at line 342.
  - Depends on: nothing
  - Verify: add an insemination event, then log a `preg_check_positive` for the same animal → expected-calving field pre-fills and hint renders.

- [ ] **1.6 Fix outgoing query params to GET endpoints**
  - Complexity: S
  - Files: `client/src/views/MilkHistoryView.vue`, `client/src/views/BreedingEventsView.vue`
  - What:
    - `MilkHistoryView.vue:228` — `params.cow_id = cowFilter.value` → `params.animal_id = cowFilter.value`. The backend query schema at `server/routes/milkRecords.ts:34` rejects unknown keys, so the animal filter currently has no effect.
    - `MilkHistoryView.vue:280, 297` — offline IndexedDB fallbacks compare `r.cow_id`; indexedDB stores use `animal_id`. Replace with `r.animal_id`.
    - `BreedingEventsView.vue:213` — same issue for breeding events.
  - Depends on: nothing
  - Verify: filter by cow in MilkHistoryView — results narrow correctly (manual); `MilkHistoryView.test.ts` asserts the param name.

- [ ] **1.7 Lint + frontend test run**
  - Complexity: S
  - Files: none
  - Depends on: 1.1–1.6
  - Verify: `npm run lint` exits 0; `cd client && npm run test:run` exits 0 (may require test-fixture updates folded into each task above).

### Phase 2 — Store API rename

- [ ] **2.1 Rename `getCowIssues` → `getAnimalIssues` in healthIssues store**
  - Complexity: S
  - Files: `client/src/stores/healthIssues.ts`, `client/src/views/LogTreatmentView.vue` (1 call site at line 288), `client/src/tests/healthIssues.store.test.ts`
  - What: rename function + call site + test. The function body already uses `i.animal_id`, only the public name is stale.
  - Depends on: Phase 1 passing
  - Verify: grep `getCowIssues` returns 0 hits; healthIssues store test passes.

- [ ] **2.2 Rename `fetchByCow` / `loadingByCow` in treatments store** _(depends on D1)_
  - Complexity: M
  - Files: `client/src/stores/treatments.ts`, all 3 call sites (AnimalDetailView, LogTreatmentView, AnimalTreatmentHistoryView — grep before starting), `client/src/tests/treatments.store.test.ts`
  - What: rename `fetchByCow` → `fetchByAnimal`, `loadingByCow` → `loadingByAnimal`. Param `cowId` → `animalId` inside function.
  - Skip if D1 = "defer" (leave these as-is, file a separate ticket).
  - Depends on: D1 decision, 2.1
  - Verify: grep `fetchByCow`/`loadingByCow` returns 0 hits; treatments store test passes.

- [ ] **2.3 Rename `withdrawalCows` / `milkCows` / `meatCows` / `paginated*Cows`** _(depends on D1)_
  - Complexity: M
  - Files: `client/src/stores/treatments.ts`, `client/src/views/WithdrawalListView.vue`, `client/src/tests/WithdrawalListView.test.ts`, `client/src/tests/treatments.store.test.ts`
  - What: rename store field `withdrawalCows` → `withdrawalAnimals`; view computeds `milkCows` / `meatCows` / `paginatedMilkCows` / `paginatedMeatCows` → `...Animals`.
  - Skip if D1 = "defer".
  - Depends on: D1 decision, 2.2
  - Verify: grep `withdrawalCows\|milkCows\|meatCows` returns 0 hits; withdrawal view renders both tabs correctly.

### Phase 3 — Local form state + router query params

- [ ] **3.1 Rename `form.cow_id` → `form.animal_id` in LogBreedingView**
  - Complexity: M
  - Files: `client/src/views/LogBreedingView.vue`, `client/src/tests/LogBreedingView.test.ts`
  - What: 18 internal references (form model, error key, validation, watch dependency, computed, payload, load). The payload field is already `animal_id` since the hotfix — this completes the rename by aligning local state with the wire format and removes the mental tax of two names for one field.
  - Also remove the `created.animal_id ?? created.cow_id` fallbacks (lines 518, 521) and `data.animal_id ?? data.cow_id` (line 548) since the backend is fully on `animal_id`.
  - Also update `route.query.cow_id` reads at lines 315, 520, 570 to check `animal_id` first, falling back to `cow_id` for one release cycle (see D2).
  - Depends on: Phase 1 passing (so the preg-check fix isn't tangled up)
  - Verify: log a breeding event end-to-end (insemination → preg check → calving); edit an existing event; `LogBreedingView.test.ts` passes.

- [ ] **3.2 Rename `form.cow_id` → `form.animal_id` in LogTreatmentView**
  - Complexity: M
  - Files: `client/src/views/LogTreatmentView.vue`, `client/src/tests/LogTreatmentView.test.ts`
  - What: 10 internal references. Also: `prefillCowId` → `prefillAnimalId`, error key, computed, call to `getAnimalIssues` (should be done in 2.1), payload submission.
  - Depends on: 2.1 (healthIssues store rename)
  - Verify: log a treatment prefilled from an issue; log standalone; tests pass.

- [ ] **3.3 Rename `form.cow_id` → `form.animal_id` in LogIssueView**
  - Complexity: S
  - Files: `client/src/views/LogIssueView.vue`, `client/src/tests/LogIssueView.test.ts`
  - What: 6 internal references. Same pattern as 3.2.
  - Depends on: nothing
  - Verify: log an issue prefilled from animal detail; log standalone; tests pass.

- [ ] **3.4 Rename `cowFilter` → `animalFilter` in filter views** _(optional polish)_
  - Complexity: S
  - Files: `MilkHistoryView.vue`, `BreedingEventsView.vue`
  - What: local ref + v-model + watcher. Purely internal — user doesn't see it. Defer if token budget tight.
  - Depends on: 1.6
  - Verify: filter behavior unchanged.

### Phase 4 — Test fixture cleanup

- [ ] **4.1 Update test fixtures to use `animal_id`**
  - Complexity: L
  - Files: 11 test files (FertilityView.test.ts, BreedingNotificationsView.test.ts, breedingEvents.store.test.ts, treatments.store.test.ts, MilkRecordingView.test.ts, OpenIssuesView.test.ts, IssueDetailView.test.ts, MilkRecordCard.test.ts, MilkEntryCard.test.ts, MilkHistoryView.test.ts, LogBreedingView.test.ts)
  - What: Replace `cow_id:` field names in mock payloads and assertions with `animal_id:`. Update any `expect(...).toHaveBeenCalledWith({ cow_id: ... })` to `animal_id`.
  - Many of these were likely already updated alongside their corresponding production files in Phases 1–3. This task is the mop-up pass.
  - Depends on: Phases 1–3
  - Verify: `grep -n cow_id client/src/tests` returns only legitimate hits (e.g. variable names like `cowId` that reference `route.params.id`, which is fine, or params tests explicitly testing the `cow_id` router-query fallback from D2).

- [ ] **4.2 Full test suite run**
  - Complexity: S
  - Files: none
  - Depends on: 4.1
  - Verify: `cd client && npm run test:run` exits 0, test count still ≥ 726.

### Phase 5 — Finalize

- [ ] **5.1 Remove `indexedDB.ts` stale comment**
  - Complexity: S
  - Files: `client/src/db/indexedDB.ts`
  - What: line 39 comment `// v12: renamed cows → animals table; cow_id → animal_id indexes` is harmless but is the final `cow_id` reference. Leave as history OR replace with `// v12: animals schema (post cow rename)`. Token-cost trivial.
  - Depends on: nothing
  - Verify: grep `cow_id` in client/src returns 0 hits (modulo D2 fallback).

- [ ] **5.2 Rebuild `client/dist`**
  - Complexity: S
  - Files: `client/dist/`
  - What: `npm run build`. Per `feedback_rebuild_dist.md`, this is required before any push.
  - Depends on: all phases
  - Verify: build exits 0 with no errors.

- [ ] **5.3 Update MEMORY.md**
  - Complexity: S
  - Files: `C:\Users\JancoEngelbrecht\.claude\projects\c--projects-myherder\memory\MEMORY.md`
  - What: Add a one-line entry marking frontend-animal-rename COMPLETE under the Phase Status block.
  - Depends on: 5.2
  - Verify: entry present, line ≤ 200 chars.

---

## Step 3 — Architecture

```
         PRODUCTION DATA FLOW (what's actually broken)

  ┌─────────────────────────────────────────────────────────┐
  │  Backend (fully renamed)                                 │
  │  Joi requires animal_id · responses return animal_id     │
  └─────────────────────────────────────────────────────────┘
              │                             │
        GET responses                 POST/PATCH bodies
              │                             │
              ▼                             ▼
  ┌─────────────────────┐       ┌─────────────────────────┐
  │  Pinia stores        │       │  Form payloads          │
  │  (✓ on animal_id)    │       │  (✓ fixed last turn)    │
  └─────────┬───────────┘       └─────────────────────────┘
            │
            ▼
  ┌─────────────────────────────────────────────────────────┐
  │  Views reading .cow_id from store data  ← SILENT BUGS    │
  │  • WithdrawalListView → /animals/undefined               │
  │  • IssueDetailView → /animals/undefined                  │
  │  • TreatmentDetailView → /animals/undefined              │
  │  • BreedingEventCard → /animals/undefined                │
  │  • LogBreedingView preg-check prefill broken             │
  │  • MilkHistoryView & BreedingEventsView filters no-op    │
  └─────────────────────────────────────────────────────────┘
```

Phase 1 severs every broken arrow. Phases 2–5 tidy up the naming drift that wouldn't crash production but makes the codebase dishonest about what it stores.

### Key decisions

- **D1 — treatments store field rename (`withdrawalCows` etc.)?**
  - _Option A (recommended): defer._ Store field names are internal; they don't affect runtime and they'd cascade into tests. The "cow" in the name is a domain term for dairy, not a typo. Also the backend still has `NON_MILKING_PHASES` / `milkCows` in the analytics layer using the word "cow" as a dairy-specific noun.
  - _Option B: include._ For full consistency with universal-livestock.
  - **Recommendation: A.** Mark Phase 2.2 and 2.3 as "defer". Smaller, safer diff.

- **D2 — backward compat for `?cow_id=` in router query params?**
  - _Option A: keep one-release fallback._ `prefillAnimalId = route.query.animal_id || route.query.cow_id || ''`. Already the pattern in LogTreatment/LogIssue. 2 extra tokens per call site.
  - _Option B: hard switch._ No fallback. Risks breaking in-flight navigation state (e.g. a user already on a LogBreedingView when the deploy lands).
  - **Recommendation: A** for LogBreedingView only (the 3 `route.query.cow_id` reads). Document for removal in next release. All other internal route pushes should be updated to emit `animal_id`.

- **Mechanical rename only.** No new abstractions, no new helpers. Each file is edited once with a direct string replacement.

- **Phase 1 is standalone-shippable.** If we run out of time, shipping Phase 1 alone fixes every known production bug and can be landed as a hotfix commit. Phases 2–5 are code-hygiene and can follow later.

---

## Step 4 — Test Matrix

| Codepath / Flow                                | Happy path                           | Error path                      | Edge case                      | Test exists?                                                  |
| ---------------------------------------------- | ------------------------------------ | ------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| WithdrawalListView animal link (milk)          | Navigate to /animals/:id             | Animal soft-deleted mid-session | Empty withdrawal list          | [x] `WithdrawalListView.test.ts` — **update fixture**         |
| WithdrawalListView animal link (meat)          | Navigate to /animals/:id             | —                               | Sheep species                  | [x] update fixture                                            |
| IssueDetailView animal row                     | Navigate to /animals/:id             | Issue missing animal_id         | —                              | [x] `IssueDetailView.test.ts` — update fixture                |
| IssueDetailView "log treatment" CTA            | Opens with prefilled animal_id       | —                               | Issue with no linked treatment | [x] update fixture                                            |
| TreatmentDetailView animal row                 | Navigate to /animals/:id             | —                               | —                              | [x] `TreatmentDetailView.test.ts` — update fixture            |
| BreedingEventCard click-through (showCow=true) | Navigate to /animals/:id             | event.animal_id null            | —                              | [x] `BreedingEventCard.test.ts` — update fixture              |
| LogBreedingView preg-check auto-prefill        | Fills calving date from latest insem | No prior insemination           | Multiple insems, pick latest   | [x] `LogBreedingView.test.ts` — **NEW assertion** for prefill |
| MilkHistoryView filter by animal               | Only matching records                | Unknown animal_id               | Empty results                  | [x] `MilkHistoryView.test.ts` — update param assertion        |
| BreedingEventsView filter by animal            | Only matching events                 | —                               | Paginated result               | [ ] **NEW** quick test or manual                              |
| LogBreedingView create (after form rename)     | POST animal_id                       | Validation error                | Edit existing event            | [x] `LogBreedingView.test.ts` — **update fixture**            |
| LogTreatmentView create (after form rename)    | POST animal_id                       | —                               | Prefilled from issue           | [x] `LogTreatmentView.test.ts` — update fixture               |
| LogIssueView create (after form rename)        | POST animal_id                       | —                               | —                              | [x] `LogIssueView.test.ts` — update fixture                   |
| Router query `?cow_id=` fallback (D2)          | Prefill still works                  | `?animal_id=` takes priority    | Both present → prefer new      | [ ] **NEW** targeted test per view (3 tests)                  |

**Test additions required:**

1. `LogBreedingView.test.ts` — assert preg-check-positive prefills `expected_calving` from latest insemination (Phase 1.5 regression guard).
2. `LogBreedingView.test.ts` / `LogTreatmentView.test.ts` / `LogIssueView.test.ts` — one test each asserting legacy `?cow_id=` query param still prefills (D2 fallback contract).

---

## Step 5 — Failure Modes

| Codepath                                          | Failure scenario                                     | Covered by test?                       | Error handling?                                  | Silent failure?                           |
| ------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| WithdrawalListView                                | `item.animal_id` also missing (schema drift)         | Yes (assertion)                        | No — RouterLink would go to `/animals/undefined` | Yes today → **No after 1.1**              |
| LogBreedingView preg-check prefill                | store.events hasn't loaded yet                       | No — gate is `if (!cowId) return null` | Yes (returns null)                               | No (falls through to empty form)          |
| MilkHistoryView filter                            | API rejects unknown `cow_id` param as 400            | No                                     | No — error toast would show                      | No (loud 400)                             |
| MilkHistoryView filter (offline)                  | IndexedDB compares `r.cow_id === ...` → always false | Yes after 1.6                          | No                                               | Yes today → **No after 1.6**              |
| Router `?cow_id=` fallback removed prematurely    | User mid-navigation on old bundle loses prefill      | Yes (D2 test)                          | Partial — silent empty form                      | Yes — **mitigated by 1-release fallback** |
| LogBreedingView `created.cow_id` fallback removal | Backend returns `cow_id` for some legacy reason      | No (backend is fully renamed)          | No                                               | N/A — backend verified                    |
| BreedingEventCard click when `show-cow=false`     | `event.animal_id` never read                         | n/a                                    | n/a                                              | No                                        |

**Critical gaps:**

- **None remaining after Phase 1.** All silent failures are addressed by the production-code changes. Test additions in Step 4 lock them in.

---

## Step 6 — Performance

No performance impact. Pure rename. No new queries, no new allocations, no new re-renders.

---

## Step 7 — Design Decisions Needed

Before running `/implement-plan`, confirm:

1. **D1 — Include `withdrawalCows` / `fetchByCow` rename in Phase 2?**
   - Recommendation: **Defer** (skip Tasks 2.2 and 2.3). Reduces diff and test churn. These are internal names — no runtime impact.

2. **D2 — Keep one-release `?cow_id=` query-param fallback in `LogBreedingView`?**
   - Recommendation: **Yes**, matching the existing LogTreatment/LogIssue pattern. Remove in a follow-up commit next release.

3. **D3 — Ship Phase 1 as a hotfix commit first, or bundle all phases?**
   - Recommendation: **Bundle all phases.** All phases land on the `feature/herd-management` branch. Phase 1 fixes are real bugs but none block a user from completing core flows (they break click-throughs; users can still navigate manually). Bundling is the minimum-churn path and the sub-plan is sized for one `/implement-plan` run.

Once these are confirmed, phases are ready to execute in order: **1 → 3 → 4 → 5**, skipping Phase 2.2–2.3 per D1. Phase 2.1 (`getCowIssues` rename) still runs as part of Phase 2 since it's a single low-risk symbol.

---

## File Change Summary

**Production (Phase 1 — bug fixes):** 7 files

- `WithdrawalListView.vue`, `IssueDetailView.vue`, `TreatmentDetailView.vue`, `BreedingEventCard.vue`, `LogBreedingView.vue`, `MilkHistoryView.vue`, `BreedingEventsView.vue`

**Production (Phases 2–3 — rename):** 5 files

- `healthIssues.ts` store, `LogBreedingView.vue`, `LogTreatmentView.vue`, `LogIssueView.vue`, optionally `MilkHistoryView.vue` + `BreedingEventsView.vue` for `cowFilter` local ref

**Tests (Phase 4):** 11 files

- FertilityView, BreedingNotificationsView, breedingEvents.store, treatments.store, MilkRecordingView, OpenIssuesView, IssueDetailView, MilkRecordCard, MilkEntryCard, MilkHistoryView, LogBreedingView

**Finalize (Phase 5):** 2 files

- `indexedDB.ts` (comment only), `client/dist/*` rebuild

**Total: ~25 files touched, all mechanical.** No new files. No new dependencies.
