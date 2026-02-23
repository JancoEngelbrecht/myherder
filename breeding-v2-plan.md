# Breeding Feature v2 — Implementation Plan

## Context

The current breeding feature (Phase 4C) has hardcoded timing values (21d heat cycle, 283d gestation, etc.), no life phase tracking, no breed configuration, and limited cow list filtering. This plan enhances breeding to support configurable breed types with per-breed timing, life phase badges (Calf/Heifer/Cow/Young Bull/Bull), post-calving calf registration flow, dry-off management, dismissable planning notifications, and advanced cow list filters.

## Design Decisions

- **Life phases**: Hybrid — auto-calculated from age + sex + calving history, with manual override via `life_phase_override` column
- **Bull registration**: `is_external` boolean + `purpose` enum (natural_service / ai_semen_donor / both)
- **Breed types**: New config table with per-breed timing values, pre-seeded with common breeds, replaces free-text breed field
- **Status model**: Primary status enum unchanged. Secondary flags: `is_dry` (stored boolean), `is_ready_to_breed` (computed, not stored)
- **Notifications**: All are planning aids, all dismissable. Dismiss = clear with audit trail, no recalculation. Overdue items in "Needs Attention" section at top of Breeding Hub
- **Post-calving flow**: Calving event → auto-navigate to Add Cow form with dam/sire/breed/DOB/sex pre-filled
- **Dry-off**: Upcoming notification with Accept/Reject prompt. Accept creates dry_off event + sets is_dry flag. Status stays `pregnant`.

---

## PHASE 1: Database Migrations

### Step 1.1 — Create `breed_types` table
- **Create** `server/migrations/017_create_breed_types.js`
- Table columns: `id` (string 36 PK), `code` (string 50, unique), `name` (string 100), `heat_cycle_days` (int, default 21), `gestation_days` (int, default 283), `preg_check_days` (int, default 35), `voluntary_waiting_days` (int, default 45), `dry_off_days` (int, default 60), `calf_max_months` (int, default 6), `heifer_min_months` (int, default 15), `young_bull_min_months` (int, default 15), `is_active` (bool, default true), `sort_order` (int, default 0), `created_at`/`updated_at` timestamps
- Inline-seed 5 breeds (pattern from migration 012/016):
  - Holstein: gestation 280, voluntary_waiting 50, calf 6mo, heifer 15mo
  - Jersey: gestation 279, heifer 14mo
  - Ayrshire: gestation 279
  - Nguni: gestation 285, voluntary_waiting 60, calf 8mo, heifer 18mo
  - Brahman: gestation 292, voluntary_waiting 60, calf 8mo, heifer 24mo
- Use `const { randomUUID: uuidv4 } = require('crypto')` for IDs

### Step 1.2 — Add breeding columns to `cows` table
- **Create** `server/migrations/018_add_cow_breeding_columns.js`
- Add columns: `breed_type_id` (string 36, FK→breed_types, nullable), `is_external` (bool, default false), `purpose` (string 30, nullable), `life_phase_override` (string 30, nullable), `is_dry` (bool, default false)
- Migrate existing free-text `breed` values: match case-insensitively against seeded breed_types, create new breed_type rows for unmatched values, update `breed_type_id` on all cows
- Keep old `breed` column for backward compat

### Step 1.3 — Add dismiss columns + dry_off event type
- **Create** `server/migrations/019_add_breeding_event_dismiss.js`
- Add to `breeding_events`: `dismissed_at` (timestamp, nullable), `dismissed_by` (string 36, FK→users, nullable), `dismiss_reason` (string 500, nullable)
- Insert `dry_off` event type into `breeding_event_types` (code: dry_off, name: Dry Off, emoji: 🌿, sort_order: 7)

### Verification
- `npm run migrate` succeeds
- `SELECT * FROM breed_types` returns 5+ rows
- New columns exist on `cows` and `breeding_events`
- `dry_off` event type exists in `breeding_event_types`
- Existing `GET /api/cows` and `GET /api/breeding-events` still work unchanged

---

## PHASE 2: Backend API Updates

### Step 2.1 — Create breed-types API route
- **Create** `server/routes/breedTypes.js`
- Follow pattern from `server/routes/issueTypes.js`
- `GET /` — active breed types by sort_order; `?all=1` for all including inactive
- `POST /` — admin only, Joi validates name + all timing fields, auto-generates code slug from name, returns 201
- `PUT /:id` — admin only, code immutable, returns 200
- `DELETE /:id` — admin only, block if cows reference this breed_type_id (409 with count), else delete

### Step 2.2 — Mount route in app.js
- **Modify** `server/app.js`
- Add `app.use('/api/breed-types', require('./routes/breedTypes'))` after the breeding-event-types line

### Step 2.3 — Update cows API
- **Modify** `server/routes/cows.js`
- Add to Joi schema: `breed_type_id`, `is_external`, `purpose`, `life_phase_override`, `is_dry`
- Add GET filters: `sex`, `breed_type_id`, `is_dry` query params
- GET /:id left-joins `breed_types` to return `breed_type_name`, `breed_type_code`
- POST/PUT pass through new fields

### Step 2.4 — Update breeding events API
- **Modify** `server/routes/breedingEvents.js`
- **calcDates**: Change signature to `calcDates(eventType, eventDate, breedTimings = {})`. Replace hardcoded values: 21 → `breedTimings.heat_cycle_days ?? 21`, 35 → `breedTimings.preg_check_days ?? 35`, 283 → `breedTimings.gestation_days ?? 283`, 60 → `breedTimings.dry_off_days ?? 60`
- **POST/PATCH handlers**: Fetch cow's breed_type_id → look up breed timings → pass to calcDates
- **dry_off handling**: If event_type === 'dry_off', set `is_dry = true` on cow (no status transition)
- **New endpoint**: `PATCH /:id/dismiss` — sets dismissed_at, dismissed_by, dismiss_reason. Any authenticated user can dismiss.
- **Update `/upcoming`**: Exclude dismissed events (`dismissed_at IS NULL`). Add `dryOffs` category (pregnant cows with is_dry=false approaching expected_dry_off). Add `needsAttention` array (all overdue items from past 30 days). Add `is_overdue` flag on each item.

### Verification
- `GET /api/breed-types` returns 5 breeds
- `POST /api/breed-types` creates new breed (admin)
- `GET /api/cows?sex=female` filters correctly
- `GET /api/cows?breed_type_id=<uuid>` filters correctly
- POST breeding event for cow with breed_type_id uses breed-specific timing in auto-dates
- `PATCH /api/breeding-events/:id/dismiss` sets dismissed_at
- `GET /api/breeding-events/upcoming` returns `dryOffs`, `needsAttention`, excludes dismissed

---

## PHASE 3: Breed Types Store + Admin Page

### Step 3.1 — Create breed types Pinia store
- **Create** `client/src/stores/breedTypes.js`
- Pattern from `client/src/stores/breedingEventTypes.js`
- State: `types[]`, `loading`
- Methods: `fetchAll()` (GET ?all=1, offline fallback to FALLBACK array), `fetchActive()`, `create()`, `update()`, `remove()`
- Computed: `activeTypes` (filtered + sorted by sort_order)
- Helper: `getById(id)` — find by id in types array

### Step 3.2 — Create breed types admin view
- **Create** `client/src/views/admin/BreedTypeManagement.vue`
- Pattern from `client/src/views/admin/BreedingEventTypeManagement.vue`
- List all breed types as cards: name, code badge, timing values grid, active/inactive badge
- Edit form: name, all 8 timing fields, is_active, sort_order (code is immutable, displayed only)
- Add form: same minus code (auto-generated from name)
- Delete with ConfirmDialog — shows error if breed in use

### Step 3.3 — Add route to router
- **Modify** `client/src/router/index.js`
- Add `/admin/breed-types` route (requiresAuth + requiresAdmin), lazy-load BreedTypeManagement.vue

### Step 3.4 — Add link to Settings page
- **Modify** `client/src/views/admin/SettingsView.vue`
- Add Breed Types card (🐄 icon) linking to `/admin/breed-types`

### Step 3.5 — Add i18n keys
- **Modify** `client/src/i18n/en.json` — add `breedTypes` namespace:
  ```json
  "breedTypes": {
    "title": "Breed Types",
    "addTitle": "Add Breed Type",
    "editTitle": "Edit Breed Type",
    "name": "Name",
    "namePlaceholder": "e.g. Holstein",
    "code": "Code (immutable)",
    "heatCycleDays": "Heat Cycle (days)",
    "gestationDays": "Gestation (days)",
    "pregCheckDays": "Preg Check After (days)",
    "voluntaryWaitingDays": "Voluntary Waiting (days)",
    "dryOffDays": "Dry-off Before Calving (days)",
    "calfMaxMonths": "Calf Phase Max (months)",
    "heiferMinMonths": "Heifer Min Age (months)",
    "youngBullMinMonths": "Young Bull Min Age (months)",
    "sortOrder": "Sort Order",
    "deleteConfirm": "Delete this breed type? This cannot be undone.",
    "deleteBlocked": "Cannot delete: this breed is assigned to {count} cow(s).",
    "timingDefaults": "Timing & Phase Defaults"
  }
  ```
- Add `settings.breedTypesDesc`: "Manage breed types and their timing defaults"
- **Modify** `client/src/i18n/af.json` — matching Afrikaans translations

### Verification
- Settings → Breed Types shows 5 breeds with timing values
- Edit breed timings, save — updates in list
- Add new breed type — appears in list
- Delete blocked if breed in use
- EN/AF locales both work

---

## PHASE 4: Cow Form, List & Card Enhancements

### Step 4.1 — Add life phase + ready-to-breed computation to cows store
- **Modify** `client/src/stores/cows.js`
- Add exported `computeLifePhase(cow, breedType)`:
  - If `cow.life_phase_override` exists, return it
  - Calculate age in months from `cow.dob`
  - Male: age < calf_max_months → 'calf', < young_bull_min_months → 'young_bull', else 'bull'
  - Female: age < calf_max_months → 'calf', < heifer_min_months → 'heifer', else 'cow'
  - Use breed defaults (6, 15, 15) when breedType is null
- Add exported `computeIsReadyToBreed(cow, breedType, lastCalvingDate)`:
  - Male → false. Pregnant → false. No DOB → false.
  - No calving history (heifer): ready if age >= heifer_min_months
  - Has calving history (cow): ready if days since last calving >= voluntary_waiting_days

### Step 4.2 — Update CowFormView
- **Modify** `client/src/views/CowFormView.vue`
- Import `useBreedTypesStore`, fetch active types on mount
- Replace free-text breed input with `<select>` dropdown bound to `form.breed_type_id`
- Add bull-only fields (when sex=male): `is_external` checkbox, `purpose` select (natural_service/ai_semen_donor/both)
- Add `life_phase_override` dropdown (optional): empty=auto-calculated, calf, heifer, cow, young_bull, bull
- Add `is_dry` checkbox (female only)
- On submit: if female, null out purpose/is_external

### Step 4.3 — Update CowListView with advanced filters
- **Modify** `client/src/views/CowListView.vue`
- Import `useBreedTypesStore`
- Add collapsible "Advanced Filters" section below status filter chips:
  - Sex filter chips: All / Female / Male
  - Breed type select dropdown
  - Life phase filter chips: All / Calf / Heifer / Cow / Young Bull / Bull
- Pass `sex` and `breed_type_id` to API call
- Life phase filtering applied client-side post-fetch (computed property)

### Step 4.4 — Update CowCard with life phase badge
- **Modify** `client/src/components/organisms/CowCard.vue`
- Import `computeLifePhase` from cows store and `useBreedTypesStore`
- Compute life phase for the cow
- Show `<span class="badge badge-phase-{phase}">{{ t('lifePhase.{phase}') }}</span>` next to status badge

### Step 4.5 — Add life phase badge styles
- **Modify** `client/src/style.css`
- Add after existing badge styles:
  ```css
  .badge-phase-calf { background: #FFF3E0; color: #E65100; }
  .badge-phase-heifer { background: #FCE4EC; color: #C62828; }
  .badge-phase-cow { background: #E8F5E9; color: #2E7D32; }
  .badge-phase-young_bull { background: #E3F2FD; color: #1565C0; }
  .badge-phase-bull { background: #EDE7F6; color: #4527A0; }
  ```

### Step 4.6 — Add i18n keys
- **Modify** `client/src/i18n/en.json`:
  ```json
  "lifePhase": {
    "calf": "Calf", "heifer": "Heifer", "cow": "Cow",
    "young_bull": "Young Bull", "bull": "Bull"
  }
  ```
  Add to `cowForm`: `selectBreed`, `isExternal`, `purpose`, `purposeNatural`, `purposeAI`, `purposeBoth`, `lifePhaseOverride`, `lifePhaseAuto`, `isDry`
  Add to `cows`: `filterFemale`, `filterMale`, `advancedFilters`, `filterBreedType`, `filterLifePhase`, `filterAllBreeds`, `filterAllPhases`
- **Modify** `client/src/i18n/af.json` — matching Afrikaans translations

### Verification
- Cow form shows breed dropdown with 5+ breeds
- Bull fields appear when sex=male, hidden for female
- Cow list advanced filters: sex and breed type filter cows correctly
- CowCard shows life phase badge based on age
- EN/AF both work

---

## PHASE 5: Enhanced Breeding Hub

### Step 5.1 — Update breeding events store
- **Modify** `client/src/stores/breedingEvents.js`
- Add `dismissEvent(id, reason)`: PATCH `/breeding-events/${id}/dismiss`, update local state + IndexedDB, refresh upcoming
- Add `dryOffs: []` and `needsAttention: []` to `upcoming` reactive
- Update `fetchUpcoming()` to read new API response fields
- Update `gestationPercent(expectedCalving, gestationDays = 283)` to accept custom gestation days

### Step 5.2 — Update BreedingHubView
- **Modify** `client/src/views/BreedingHubView.vue`
- Add **"Needs Attention" section** at top of page (above stats row):
  - Shows all items from `breedingStore.upcoming.needsAttention`
  - Each row: cow tag, cow name, event type emoji, alert type, date, overdue badge
  - Each row has "Dismiss" button (secondary style)
  - Clicking row navigates to cow repro page
  - Dismiss uses ConfirmDialog with optional reason input
- Add **dry-off alerts group** alongside heats/calvings/pregChecks
- Add **filter tabs** above recent events: All / Heats / Inseminations / Preg Checks / Calvings / Dry-Offs

### Step 5.3 — Add i18n keys
- **Modify** `client/src/i18n/en.json`:
  Add to `breeding`: `needsAttention`, `dismiss`, `dismissReason`, `dismissConfirm`, `dismissed`
  Add to `breeding.upcoming`: `dryOffs`: "Due for Dry-Off"
  Add to `breeding.alert`: `dryOffIn`: "Dry-off in {days}d"
- **Modify** `client/src/i18n/af.json` — matching translations

### Verification
- Breeding Hub shows "Needs Attention" at top with overdue items
- Dismiss clears notification, persists across refresh
- Dry-off alerts appear for pregnant cows approaching dry-off
- Filter tabs work correctly
- EN/AF both work

---

## PHASE 6: Post-Calving Flow & Dry-Off Handling

### Step 6.1 — Update LogBreedingView for post-calving redirect
- **Modify** `client/src/views/LogBreedingView.vue`
- After creating a `calving` event (non-edit mode):
  - Extract calving_details (calf_sex, calf_tag_number) from form
  - Fetch cow's breeding events to find sire from latest insemination
  - Fetch cow's breed_type_id
  - Navigate: `router.replace({ path: '/cows/new', query: { from_calving: 'true', dam_id, sire_id, breed_type_id, dob: today, sex: calf_sex, tag_number: calf_tag } })`

### Step 6.2 — Update CowFormView for calving pre-fill
- **Modify** `client/src/views/CowFormView.vue`
- On mount, if `route.query.from_calving === 'true'`, pre-fill: dam_id, sire_id, breed_type_id, dob, sex, tag_number from query params
- Show banner: "Registering calf from calving event. All fields can be changed."

### Step 6.3 — Add dry-off handling to breeding hub
- **Modify** `client/src/views/BreedingHubView.vue`
- Dry-off alert cards get two action buttons:
  - "Accept Dry-Off": creates dry_off breeding event + updates cow is_dry=true via cowsStore.update()
  - "Not Yet": calls breedingStore.dismissEvent() to dismiss the alert

### Step 6.4 — Add i18n keys
- **Modify** `client/src/i18n/en.json`:
  Add to `cowForm`: `fromCalvingBanner`: "Registering calf from calving event. All fields can be changed."
  Add to `breeding`: `dryOff.accept`: "Accept Dry-Off", `dryOff.reject`: "Not Yet", `dryOff.prompt`: "Transition {tag} to dry status?", `dryOff.accepted`: "Dry-off recorded"
- **Modify** `client/src/i18n/af.json` — matching translations

### Verification
- Log calving event → redirected to Add Cow form with dam/sire/breed/DOB/sex/tag pre-filled
- All pre-filled fields are editable
- Banner message shown on pre-filled form
- Accept Dry-Off: creates dry_off event + sets is_dry on cow
- Not Yet: dismisses the alert

---

## PHASE 7: IndexedDB + Breed-Aware Frontend Calculations

### Step 7.1 — Update IndexedDB to version 6
- **Modify** `client/src/db/indexedDB.js`
- Add `db.version(6).stores({...})` keeping all existing tables, adding: `breedTypes: 'id, code, name, is_active, sort_order'`

### Step 7.2 — Update LogBreedingView auto-date preview
- **Modify** `client/src/views/LogBreedingView.vue`
- Import `useBreedTypesStore`
- When cow selected, look up breed timings via cow's breed_type_id
- Update autoDates computed: replace hardcoded 21/35/283/60 with breed-specific values (with fallback defaults)

### Step 7.3 — Update CowReproView for breed-aware gestation
- **Modify** `client/src/views/CowReproView.vue`
- Import `useBreedTypesStore`, look up cow's breed gestation_days
- Update gestation progress bar to use breed-specific total days
- Update display text: "{days} / {total} days" (not hardcoded 283)

### Step 7.4 — Update CowDetailView
- **Modify** `client/src/views/CowDetailView.vue`
- Show `breed_type_name` instead of free-text `breed`
- Show life phase badge using `computeLifePhase`
- For males: show `purpose` and `is_external` badge

### Step 7.5 — Final i18n updates
- **Modify** `client/src/i18n/en.json`:
  Update `breeding.gestationProgress` to accept `{total}` param
  Add to `cowDetail`: `lifePhase`, `breedType`, `external`, `purpose`
- **Modify** `client/src/i18n/af.json` — matching translations

### Verification
- IndexedDB upgrades v5→v6 without data loss
- Auto-date preview shows breed-specific values (e.g. Brahman 292d gestation)
- CowReproView gestation bar uses breed-specific days
- CowDetailView shows breed name, life phase, bull info
- EN/AF both work
- `npm run build` succeeds with no errors

---

## Files Summary

### New files (6)
| File | Phase |
|------|-------|
| `server/migrations/017_create_breed_types.js` | 1 |
| `server/migrations/018_add_cow_breeding_columns.js` | 1 |
| `server/migrations/019_add_breeding_event_dismiss.js` | 1 |
| `server/routes/breedTypes.js` | 2 |
| `client/src/stores/breedTypes.js` | 3 |
| `client/src/views/admin/BreedTypeManagement.vue` | 3 |

### Modified files (18)
| File | Phases |
|------|--------|
| `server/app.js` | 2 |
| `server/routes/cows.js` | 2 |
| `server/routes/breedingEvents.js` | 2 |
| `client/src/router/index.js` | 3 |
| `client/src/views/admin/SettingsView.vue` | 3 |
| `client/src/stores/cows.js` | 4 |
| `client/src/views/CowFormView.vue` | 4, 6 |
| `client/src/views/CowListView.vue` | 4 |
| `client/src/components/organisms/CowCard.vue` | 4 |
| `client/src/style.css` | 4 |
| `client/src/stores/breedingEvents.js` | 5 |
| `client/src/views/BreedingHubView.vue` | 5, 6 |
| `client/src/views/LogBreedingView.vue` | 6, 7 |
| `client/src/db/indexedDB.js` | 7 |
| `client/src/views/CowReproView.vue` | 7 |
| `client/src/views/CowDetailView.vue` | 7 |
| `client/src/i18n/en.json` | 3, 4, 5, 6, 7 |
| `client/src/i18n/af.json` | 3, 4, 5, 6, 7 |

### Existing patterns to reuse
| Pattern | Reference File |
|---------|---------------|
| Migration with inline seeding | `server/migrations/016_create_breeding_event_types.js` |
| CRUD route with code slug | `server/routes/issueTypes.js` |
| Pinia store with offline fallback | `client/src/stores/breedingEventTypes.js` |
| Admin management view | `client/src/views/admin/BreedingEventTypeManagement.vue` |
| Joi validation schemas | `server/routes/cows.js` |
| calcDates auto-calculation | `server/routes/breedingEvents.js` |
| Base query helper with joins | `server/routes/breedingEvents.js` (breedingQuery) |
| ConfirmDialog for deletes | `client/src/components/molecules/ConfirmDialog.vue` |
| CowSearchDropdown for cow selection | `client/src/components/molecules/CowSearchDropdown.vue` |
