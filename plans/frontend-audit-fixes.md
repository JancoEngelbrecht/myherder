# Frontend Audit Fixes Plan

> Parent: Phase 17 in `PLAN.md`
> Audit date: 2026-03-11
> Scores: Safety 78, Quality 72, Efficiency 72, Dead Code 82 (Overall 76)

---

## Tier 1: Zero-Risk Fixes (no behavior change, cannot break anything)

### 1A — i18n Bug Fix + Dead Key Cleanup
- [ ] Fix `audit.entityTypes.medication` — add nested key to both `en.json` and `af.json`, delete orphaned `entityTypes_medication`
- [ ] Delete orphaned i18n keys from both locale files:
  - `superAdmin.farmList`
  - `settings.exporting`
  - `dashboard.herdSummary`
  - `globalDefaults.systemStats`
  - ~~`status.dry`, `status.sick`, `status.sold`, `status.dead`~~ — KEEP: used dynamically via `t(\`status.${cow.status}\`)` in CowCard + CowDetailView
  - `milkRecording.session`, `milkRecording.litres`, `milkRecording.discarded`
  - `treatments.medication` (singular), `treatments.dosage` (singular)
- [ ] Verify: `cd client && npm run test:run` — all 645+ tests pass

### 1B — Dead Store Exports Cleanup
- [ ] Remove 5 unused computed getters from `featureFlags.js` (`isBreedingEnabled`, `isMilkRecordingEnabled`, `isHealthIssuesEnabled`, `isTreatmentsEnabled`, `isAnalyticsEnabled`)
- [ ] Remove `hydrateFromCache` from `featureFlags.js` (test-only; update test file)
- [ ] Remove `pending2fa` and `pending2faSetup` refs from `auth.js` store
- [ ] Remove `MODULE_KEY_MAP` identity map from `router/index.js`, use `to.meta.requiresModule` directly
- [ ] Verify: `cd client && npm run test:run` — all tests pass

### 1C — Accessibility Attributes (purely additive)
- [ ] `ToastMessage.vue` — add `role="status"` and `aria-live="polite"` to container
- [ ] `ConfirmDialog.vue` — add `aria-modal="true"`, `aria-labelledby` pointing to message
- [ ] Filter chips — add `:aria-pressed` to `CowListView`, `MilkHistoryView`, `BreedingEventsView`, and any other chip groups
- [ ] `BottomNav.vue` — add `:aria-current="isActive(tab) ? 'page' : undefined"` to RouterLinks
- [ ] FAB buttons — add `aria-label` / `:title` to FABs in AnnouncementsView, DefaultBreedTypesView, DefaultIssueTypesView, DefaultMedicationsView, and any others missing it
- [ ] Verify: `cd client && npm run test:run` — all tests pass

### 1D — Translate Hardcoded English Strings
- [ ] `AppHeader.vue` — translate `aria-label="Back"` and `aria-label="Profile"` + language toggle title
- [ ] `SearchInput.vue` — translate `aria-label="Clear"`
- [ ] `ToastMessage.vue` — translate `aria-label="Dismiss"`
- [ ] `ConfirmDialog.vue` — use `t()` for default `confirmLabel`/`cancelLabel` props
- [ ] Add all new i18n keys to both `en.json` and `af.json`
- [ ] Verify: `cd client && npm run test:run` — all tests pass

### 1E — CSS Consolidation
- [ ] Add `.btn-sm` to global `style.css`
- [ ] Remove duplicate `.btn-sm` from scoped styles in: AnnouncementsView, DefaultBreedTypesView, DefaultIssueTypesView, DefaultMedicationsView, AuditLogView, BreedTypeManagement, IssueTypeManagement, MedicationManagement, UserManagement
- [ ] Verify: visual spot-check + tests pass

### 1F — Missing Toast Feedback
- [ ] `AnnouncementsView.vue` — add success toasts using existing `announcements.created/updated/deactivated` keys
- [ ] `AnnouncementsView.vue` — add error handling in `load()` function (currently swallows errors)
- [ ] `FarmListView.vue` — use `extractApiError(err)` in `handleEnter` catch instead of generic `t('common.error')`
- [ ] Verify: tests pass

---

## Tier 2: Low-Risk Fixes (small behavior change, isolated)

### 2A — Store Efficiency Guards
- [ ] Add `hasData` computed to `issueTypesStore` (copy pattern from `breedTypesStore`)
- [ ] Update 6 call sites to guard: `if (!issueTypesStore.hasData) issueTypesStore.fetchAll()`
  - CowIssueHistoryView, CowDetailView, IssueDetailView, LogIssueView, LogTreatmentView, OpenIssuesView
- [ ] Verify: tests pass + manual test that issue types still load on first visit

### ~~2B — Remove Redundant fetchAll After Cow Edit~~
> DROPPED: Plan audit verified this is a false positive. CowDetailView.load() only calls fetchAll() as a guard (`if cows.length === 0`), not post-edit. The cows.update() store method patches in-place. No fix needed.

### 2C — Dynamic Import for driver.js
- [ ] Convert `useTour.js` to dynamically import `driver.js` and its CSS inside `startTour()`
- [ ] Verify: tour still starts correctly, tests pass

### 2D — ConfirmDialog Keyboard Support
- [ ] Add `@keydown.escape` handler to emit `cancel`
- [ ] Auto-focus cancel button when dialog opens
- [ ] Verify: existing ConfirmDialog tests pass + manual keyboard test

---

## Tier 3: Medium-Risk Fixes (deferred — need design decisions or heavy testing)

> These are documented but NOT scheduled. Each needs a separate discussion.

- **super_admin_token → sessionStorage**: Changes UX (tab close = lose farm context). Needs user decision.
- **isInFarmContext from JWT**: Ripple effects across router, DashboardView, BottomNav, App.vue. Needs integration testing.
- **Cache herd-summary/daily-kpis**: Needs cache invalidation strategy to avoid stale analytics.
- **Extract DefaultEntityView composable**: 694-line refactor across 3 files. High test surface.
- **SW SET_DB_NAME validation**: Must test with actual multi-tenant login flow.
- **Router guard reordering**: Affects auth, 2FA, super-admin, and worker permission flows.

---

## Verification Gate

After each sub-phase:
```bash
cd client && npm run test:run          # 645+ frontend tests
npm test                                # 575+ backend tests (for i18n/store changes)
npm run lint                            # ESLint clean
npm run knip                            # No new dead code
```

## Expected Outcome
- Safety: 78 → ~85
- Quality: 72 → ~82
- Efficiency: 72 → ~78
- Dead Code: 82 → ~90
- **Overall: 76 → ~84**
