# Universal Livestock Support

> Expand MyHerder from dairy-cow-specific to universal livestock management.
> Initial target: meat sheep alongside existing cattle (dairy + beef).

## Core Design Decisions

1. **One farm = one species.** A cattle farmer gets a cattle farm. A sheep farmer gets a sheep farm. If someone has both, they create two farms and switch between them. No species toggle, no mixed views, no filtering complexity. The multi-tenancy system already supports this — we just need a farm switcher for regular users.

2. **Feature flags handle milking.** Sheep farms get `milkRecording: false`. The milk tab, milk analytics, DIM filters, milk withdrawal — all already hidden. No new work needed.

3. **Species config in DB as JSON.** Terminology (Cow/Ewe/Ram), life phases, emoji, breeding event types — all stored in `species.config`. Adding goats later = one DB row, zero code changes.

4. **Offspring via looped form.** Birth events (calving/lambing) record `offspring_count`. Then the existing Add Animal form loops N times, pre-filled from the dam. Same form, same validation, nothing new to build.

5. **Keep `cows` table + `/api/cows` route.** Renaming is massive churn for zero user value. The internal name doesn't matter.

---

## Scope

**In scope:**

- Species table with config (terminology, life phases, event types, emoji)
- `species_id` on `breed_types`, `default_breed_types`, and `cows` tables
- Farm-level species assignment (one species per farm)
- Farm switcher for regular users (workers/admins assigned to multiple farms)
- Species-aware i18n (ewe/ram vs cow/bull, lambing vs calving, flock vs herd)
- Breed types filtered by species (sheep farms only see sheep breeds)
- Species-specific default issue types, medications, and breeding parameters
- Birth events with offspring count + looped registration form
- Species-aware breeding event types (lambing/ram_service for sheep)
- Super-admin species management + species-aware farm creation

**Out of scope:**

- Wool/shearing records — separate production module, not needed for meat sheep MVP
- Weight/growth records — future feature, not species-specific
- Mixed-species farms — use separate farms + farm switcher instead
- Table rename (`cows` → `animals`) — internal detail, can alias later
- Route rename (`/api/cows` → `/api/animals`) — same reason
- Poultry/pigs — fundamentally different production models, future phases

**Assumptions:**

- Meat sheep farmers track animals individually (stud + commercial)
- Existing cattle farms continue working unchanged (100% backward compatible)
- Sheep breeds: Dorper (~150d gestation, 17d heat cycle), Meatmaster, SA Mutton Merino, Dohne Merino

---

## Architecture

```
┌─────────────┐
│   species    │  id, code, name, config (JSON)
└──────┬──────┘
       │ 1:N
       ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ breed_types  │────▶│    cows       │◀────│ breeding_    │
│ +species_id  │     │ +species_id   │     │ events       │
└─────────────┘     │ +birth_event_ │     │ +offspring_  │
                    │  id           │     │  count       │
  ┌─────────────┐   └──────────────┘     └──────────────┘
  │farm_species  │  farm_id + species_id (1:1 for now, junction for future)
  └─────────────┘
```

### Offspring Registration Flow

```
┌────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  LogBreedingView   │     │    CowFormView        │     │    CowFormView        │
│                    │     │  "Offspring 1 of 2"   │     │  "Offspring 2 of 2"   │
│  Event: Lambing    │────▶│  Pre-filled:          │────▶│  Pre-filled:          │
│  Offspring: 2      │     │  - dam = mother       │     │  - dam = mother       │
│  [Save]            │     │  - dob = event date   │     │  - dob = event date   │
│                    │     │  - breed = inherited  │     │  - breed = inherited  │
│                    │     │  [Save & Next]        │     │  [Save & Done]        │
└────────────────────┘     └──────────────────────┘     └──────────────────────┘
```

- Same Add Animal form, just looped — nothing new to build
- Farmer can **Skip** and register offspring later
- Dam detail shows "2 of 3 registered" with "Register remaining" link
- Cattle calving (usually 1) = same flow, loops once, no loop UI visible

### Farm Switcher for Regular Users

```
┌──────────────────────┐
│  AppHeader            │
│  ┌──────────────────┐ │
│  │ 🐄 Botha Cattle ▾│ │    ← tap to switch
│  └──────────────────┘ │
│         │              │
│  ┌──────▼──────────┐  │
│  │ 🐄 Botha Cattle │  │
│  │ 🐑 Botha Sheep  │  │    ← user's farms
│  └─────────────────┘  │
└────────────────────────┘
```

- User assigned to multiple farms sees a farm pill in the header
- Switching re-issues a farm-scoped JWT (like super-admin "enter farm" but for regular users)
- Single-farm users: no pill shown, no change from today
- Current farm stored in localStorage, restored on next login

---

## Phase 1: Database Foundation

**Goal:** Add species concept to the database. No frontend changes. Existing functionality unchanged.

- [ ] **1.1: Create migration 035** — S
  - Create `species` table: `id` (uuid), `code` (varchar, unique), `name` (varchar), `config` (text/JSON), `is_active` (boolean), `sort_order` (int), `created_at`, `updated_at`
  - Create `farm_species` junction table: `farm_id` (FK → farms), `species_id` (FK → species), PRIMARY KEY (farm_id, species_id)
  - Add `species_id` (uuid, nullable FK → species) to `breed_types`
  - Add `species_id` (uuid, nullable FK → species) to `default_breed_types`
  - Add `species_id` (uuid, nullable FK → species) to `cows`
  - Add `offspring_count` (integer, default 1) to `breeding_events`
  - Add `birth_event_id` (uuid, nullable FK → breeding_events) to `cows`
  - Seed two species rows with config JSON (see 1.2)
  - Backfill: set `species_id` = cattle on all existing `breed_types`, `default_breed_types`, `cows`
  - Backfill: insert `farm_species` (farm_id, cattle_species_id) for all existing farms
  - Files: `server/migrations/035_add_species.js`
  - Depends on: nothing
  - Verify: `npm test` passes, migration up/down works, existing data has species_id

- [ ] **1.2: Species config JSON** — S
  - **Cattle:**
    ```json
    {
      "terminology": {
        "singular": "Cow",
        "plural": "Cows",
        "maleSingular": "Bull",
        "femaleSingular": "Cow",
        "youngSingular": "Calf",
        "youngPlural": "Calves",
        "collectiveNoun": "Herd",
        "birthEvent": "Calving",
        "birthEventPast": "Calved",
        "maleService": "Bull Service"
      },
      "emoji": { "female": "🐄", "male": "🐂", "young": "🐮" },
      "life_phases": {
        "female": [
          { "code": "calf", "maxMonths": 6 },
          { "code": "heifer", "minMonths": 6 },
          { "code": "cow", "minMonths": 15 }
        ],
        "male": [
          { "code": "calf", "maxMonths": 6 },
          { "code": "young_bull", "minMonths": 6 },
          { "code": "bull", "minMonths": 15 }
        ]
      },
      "event_types": [
        "heat_observed",
        "ai_insemination",
        "bull_service",
        "preg_check_positive",
        "preg_check_negative",
        "calving",
        "abortion",
        "dry_off"
      ],
      "typical_multiple_births": 1,
      "max_offspring": 2
    }
    ```
  - **Sheep:**
    ```json
    {
      "terminology": {
        "singular": "Sheep",
        "plural": "Sheep",
        "maleSingular": "Ram",
        "femaleSingular": "Ewe",
        "youngSingular": "Lamb",
        "youngPlural": "Lambs",
        "collectiveNoun": "Flock",
        "birthEvent": "Lambing",
        "birthEventPast": "Lambed",
        "maleService": "Ram Service"
      },
      "emoji": { "female": "🐑", "male": "🐏", "young": "🐑" },
      "life_phases": {
        "female": [
          { "code": "lamb", "maxMonths": 6 },
          { "code": "ewe", "minMonths": 6 }
        ],
        "male": [
          { "code": "lamb", "maxMonths": 6 },
          { "code": "ram", "minMonths": 6 }
        ]
      },
      "event_types": [
        "heat_observed",
        "ai_insemination",
        "ram_service",
        "preg_check_positive",
        "preg_check_negative",
        "lambing",
        "abortion"
      ],
      "typical_multiple_births": 2,
      "max_offspring": 4
    }
    ```
  - Note: no `dry_off` for sheep (no milking)
  - Files: included in migration 035 seed data
  - Depends on: 1.1
  - Verify: species rows exist with valid JSON config

- [ ] **1.3: Seed sheep defaults** — S
  - Add to `default_breed_types` with `species_id` = sheep:
    - Dorper: gestation 150d, heat cycle 17d, preg check 30d, VWD 60d, dry_off 0d, calf_max_months 6, heifer_min_months 8, young_bull_min_months 8
    - Meatmaster: same params
    - SA Mutton Merino: same params
    - Dohne Merino: same params
  - Add sheep-specific `default_issue_types`:
    - Pulpy Kidney 💉, Blue Tongue 👅, Internal Parasites 🪱, Orf 🤕, Foot Rot 🦶
  - Add sheep-specific `default_medications`:
    - Multivax P Plus, Dectomax, Ivermectin
  - Update `farmSeedService.js` fallback arrays to include species_id
  - Files: `server/migrations/035_add_species.js`, `server/services/farmSeedService.js`
  - Depends on: 1.1
  - Verify: global defaults include sheep entries with correct species_id

---

## Phase 2: Backend Species Awareness

**Goal:** API returns species info, filters by species, supports new event types and offspring. All existing endpoints backward compatible.

- [ ] **2.1: Species read endpoint** — S
  - `GET /api/species` — public (no auth), returns active species with config
  - Used by frontend to load terminology, life phases, event types
  - Files: `server/routes/species.js`, `server/app.js` (mount)
  - Depends on: Phase 1
  - Verify: `GET /api/species` returns cattle + sheep with full config

- [ ] **2.2: Breed types — species filter** — S
  - `GET /api/breed-types?species_id=X` — filter by species
  - Without filter: returns all farm breeds (backward compat)
  - Include `species_id` in response
  - Files: `server/routes/breedTypes.js`
  - Depends on: Phase 1
  - Verify: filter returns only matching species' breeds

- [ ] **2.3: Cows route — species awareness** — M
  - `GET /api/cows?species_id=X` — filter by species
  - `POST /api/cows` — auto-set `species_id` from `breed_type_id` lookup; accept optional `birth_event_id`
  - `GET /api/cows/:id` — include `species_id` and `species_code` in response (via JOIN)
  - `PUT /api/cows/:id` — sync `species_id` when `breed_type_id` changes
  - `GET /api/cows?birth_event_id=X` — find offspring from a birth event
  - Files: `server/routes/cows.js`
  - Depends on: 2.2
  - Verify: species filter works, species_id auto-set on create, birth_event_id linking works

- [ ] **2.4: Breeding events — species-aware event types** — M
  - Add `lambing` and `ram_service` to valid `event_type` enum in Joi schemas
  - Keep species-specific codes (`calving` vs `lambing`, `bull_service` vs `ram_service`) — simpler queries, clearer audit trail
  - `breedingCalc.js`: treat `lambing` same as `calving`, `ram_service` same as `bull_service` for auto-date calc (breed timings already handle the different parameters)
  - Files: `server/helpers/breedingSchemas.js`, `server/routes/breedingEvents.js`, `server/helpers/breedingCalc.js`
  - Depends on: 2.3
  - Verify: can create lambing + ram_service events

- [ ] **2.5: Offspring count on birth events** — M
  - POST breeding event with `calving`/`lambing` accepts `offspring_count` (default 1, max from species config)
  - GET `/api/breeding-events/:id` returns `offspring_count` + `registered_offspring` (count of cows with matching `birth_event_id`)
  - No batch offspring creation — offspring created individually via `/api/cows` POST with `birth_event_id`
  - Files: `server/routes/breedingEvents.js`, `server/routes/cows.js`
  - Depends on: 2.4
  - Verify: birth event stores count, registered_offspring count correct

- [ ] **2.6: Farm creation — species selection** — S
  - `POST /api/farms` accepts `species_id` (single species for now)
  - Inserts into `farm_species` junction table
  - Seeds only breed types/issue types/medications matching the species
  - `GET /api/farms/:id` returns `species` info
  - `seedFarmDefaults()` filters by species_id
  - Sheep farms get `milkRecording: false` by default
  - Files: `server/routes/farms.js`, `server/services/farmSeedService.js`
  - Depends on: 1.3
  - Verify: create sheep farm → sheep breeds seeded, milkRecording off

- [ ] **2.7: Farm switcher API** — M
  - `GET /api/auth/my-farms` — returns farms the current user is assigned to (id, name, species, code)
  - `POST /api/auth/switch-farm/:farmId` — issues new farm-scoped JWT (like super-admin enter, but for assigned users)
  - Validation: user must be assigned to target farm (via `users.farm_id`)
  - **Note:** Currently users have a single `farm_id`. For multi-farm assignment, either:
    - Option A: `user_farms` junction table (clean but needs migration + user management changes)
    - Option B: Super-admin assigns same user to both farms (duplicate user records, simpler)
    - **Recommendation: Option B for MVP** — same username/password, two user records. Farm switcher lists farms where username matches. No schema change needed.
  - Files: `server/routes/auth.js`
  - Depends on: Phase 1
  - Verify: user with accounts on two farms can list and switch between them

- [ ] **2.8: Global defaults — species-aware push** — S
  - `POST /api/global-defaults/breed-types/push` filters by species when pushing
  - Only pushes to farms matching the species
  - Files: `server/routes/globalDefaults.js`
  - Depends on: 2.6
  - Verify: pushing sheep defaults only goes to sheep farms

- [ ] **2.9: Sync pull — include species** — S
  - `GET /api/sync/pull` returns `species` in response
  - Files: `server/routes/sync.js`
  - Depends on: 2.1
  - Verify: sync pull includes species data

---

## Phase 3: Frontend Species Engine

**Goal:** Species-aware terminology and config available throughout the frontend. No view changes yet.

- [ ] **3.1: Species store** — M
  - New Pinia store `useSpeciesStore`
  - Fetches from `/api/species`, caches in IndexedDB
  - `farmSpecies` computed: resolves current farm's species from `farm_species` data
  - Helper getters: `getTerminology(speciesId)`, `getLifePhases(speciesId)`, `getEventTypes(speciesId)`, `getEmoji(speciesId)`
  - Falls back to cattle config if species not found (backward compat)
  - Files: `client/src/stores/species.js`
  - Depends on: Phase 2
  - Verify: store loads species, returns correct config for farm's species

- [ ] **3.2: useSpeciesTerms composable** — M
  - Provides reactive species terminology for the current farm
  - Returns: `{ singular, plural, maleSingular, femaleSingular, youngSingular, collectiveNoun, birthEvent, maleService, emoji }`
  - Resolves from: farm's species (via speciesStore.farmSpecies)
  - Falls back to cattle terminology if not loaded yet
  - Files: `client/src/composables/useSpeciesTerms.js`
  - Depends on: 3.1
  - Verify: returns "Ewe"/"Ram" for sheep farm, "Cow"/"Bull" for cattle farm

- [ ] **3.3: Refactor computeLifePhase — species-aware** — M
  - Accept optional `speciesConfig` parameter (life_phases from species.config)
  - Read phases from config instead of hardcoded cattle values
  - Return species-specific phase codes: `lamb`/`ewe`/`ram` for sheep
  - Fall back to cattle phases if no config provided (backward compat)
  - Files: `client/src/stores/cows.js`
  - Depends on: 3.1
  - Verify: sheep animal returns `lamb` not `calf`, `ewe` not `heifer`

- [ ] **3.4: i18n terminology refactor** — L
  - Rename `cows` namespace → `animals` in both `en.json` and `af.json`
  - Replace hardcoded species terms with interpolated variables:
    - `"title": "Cows"` → `"title": "{collectiveNoun}"`
    - `"addCow": "Add Cow"` → `"addAnimal": "Add {species}"`
    - `"emptyTitle": "No cows found"` → `"emptyTitle": "No {speciesPlural} found"`
    - Generic strings stay as-is: `"searchPlaceholder": "Search by name or tag..."`
  - Add life phase labels for sheep: `lamb`, `ewe`, `ram`
  - Add breeding event type labels: `lambing`, `ram_service`
  - Rename `cowForm` → `animalForm`, `cowDetail` → `animalDetail`
  - Update all views that reference renamed i18n keys
  - Files: `client/src/i18n/en.json`, `client/src/i18n/af.json`, all views referencing `cows.*`/`cowForm.*`/`cowDetail.*`
  - Depends on: 3.2
  - Verify: cattle farm shows same strings as before, sheep farm shows sheep terms

- [ ] **3.5: Breeding event types config — species-scoped** — S
  - Update `breedingEventTypes.js` to add species arrays per event:
    - `bull_service` → species: `['cattle']`, `ram_service` → species: `['sheep']`
    - `calving` → species: `['cattle']`, `lambing` → species: `['sheep']`
    - Shared: `heat_observed`, `ai_insemination`, `preg_check_*`, `abortion` → all species
    - `dry_off` → species: `['cattle']` (no dry-off for meat sheep)
  - Export `getEventTypesForSpecies(speciesCode)` helper
  - Files: `client/src/config/breedingEventTypes.js`
  - Depends on: 3.1
  - Verify: sheep farm shows lambing/ram_service, cattle shows calving/bull_service

---

## Phase 4: Frontend UI Adaptation

**Goal:** All views display species-appropriate labels, emoji, and options.

- [ ] **4.1: CowListView — species-aware labels** — M
  - Replace cow emoji with species emoji from `useSpeciesTerms`
  - Life phase filter chips use species-specific phases
  - Hide DIM/yield filters when `milkRecording` feature flag is off
  - Page title uses `collectiveNoun` ("Herd" / "Flock")
  - Files: `client/src/views/CowListView.vue`
  - Depends on: Phase 3
  - Verify: sheep farm shows 🐑, "Flock" title, lamb/ewe/ram phases

- [ ] **4.2: CowCard — species-aware** — S
  - Species emoji instead of hardcoded 🐄/🐂
  - Life phase badge uses species-specific labels
  - Files: `client/src/components/organisms/CowCard.vue`
  - Depends on: 3.2
  - Verify: sheep card shows 🐑/🐏

- [ ] **4.3: CowFormView — species-aware + offspring mode** — M
  - Breed type dropdown filtered by farm's species (via species_id on breed_types)
  - `purpose` field label generalizes: "Natural Service" works for both bull/ram
  - Life phase override uses species-specific options
  - **Offspring mode** (when `birth_event_id` in route query):
    - Pre-fill: dam_id, sire_id, dob, species_id, breed_type_id from query params
    - Progress header: "Register Offspring 1 of 3" with progress bar
    - "Save & Next" → create animal, increment index, reset form (keep pre-fills)
    - "Save & Done" (last or any time) → create animal, navigate to dam detail
    - "Skip" → navigate away, birth event retains the count
    - Single offspring (cattle): no loop UI, just "Save" as normal
  - Files: `client/src/views/CowFormView.vue`
  - Depends on: 3.2, 3.3, 2.5
  - Verify: sheep form shows sheep breeds; offspring mode loops correctly

- [ ] **4.4: CowDetailView — species-aware** — M
  - Species emoji in header
  - Life phase shows species-specific label
  - Milk sections hidden via feature flag (already works)
  - Meat withdrawal works for all species, milk withdrawal only when `milkRecording` enabled
  - **Incomplete offspring indicator:** when animal has a birth event as dam with `offspring_count > registered`, show "2 of 3 offspring registered" + "Register remaining" link
  - Files: `client/src/views/CowDetailView.vue`
  - Depends on: 3.2
  - Verify: sheep detail shows 🐑, offspring indicator works

- [ ] **4.5: LogBreedingView — species-aware events + offspring count** — M
  - Event type dropdown filtered by species (via `getEventTypesForSpecies`)
  - Birth events (calving/lambing) show `offspring_count` number input, default from `species.config.typical_multiple_births`
  - After saving birth event with offspring_count > 0, prompt: "Register offspring now?" → Yes navigates to CowFormView offspring mode, No goes to breeding hub
  - Labels: "Bull Service" → "Ram Service", "Calving" → "Lambing" (from species config, resolved via i18n)
  - Files: `client/src/views/LogBreedingView.vue`
  - Depends on: 3.5, 2.5
  - Verify: sheep breeding shows lambing/ram_service, offspring_count saved, redirects to form

- [ ] **4.6: BreedingHubView + Notifications — species-aware** — S
  - Notifications use species terms ("Expected Lambing" not "Expected Calving")
  - Hub stats use species terms
  - Files: `client/src/views/BreedingHubView.vue`, `client/src/views/BreedingNotificationsView.vue`
  - Depends on: 3.5
  - Verify: sheep hub shows correct labels

- [ ] **4.7: Dashboard — species-aware** — S
  - Status summary: "Your Flock" vs "Your Herd"
  - Quick action labels adapt
  - Files: `client/src/views/DashboardView.vue`
  - Depends on: 3.2
  - Verify: sheep farm dashboard shows "Flock"

- [ ] **4.8: Analytics — species-aware labels** — S
  - Chart titles use species terms
  - Milk analytics hidden when `milkRecording` off (already works)
  - Files: `client/src/views/analytics/*.vue`, `client/src/views/AnalyticsView.vue`
  - Depends on: 3.2
  - Verify: sheep analytics show "Flock" in titles, no milk charts

- [ ] **4.9: Navigation — species-aware** — S
  - BottomNav: "Cows" label → `collectiveNoun` from species terms
  - AppHeader: species emoji next to farm name
  - Files: `client/src/components/organisms/BottomNav.vue`, `client/src/components/organisms/AppHeader.vue`
  - Depends on: 3.2
  - Verify: nav shows "Flock" for sheep, "Herd" for cattle

- [ ] **4.10: CowSearchDropdown — species-aware** — S
  - Placeholder: "Search {speciesPlural}..."
  - Files: `client/src/components/molecules/CowSearchDropdown.vue`
  - Depends on: 3.2
  - Verify: shows "Search sheep..." for sheep

---

## Phase 5: Farm Switcher + Super-Admin

**Goal:** Users on multiple farms can switch between them. Super-admin can manage species and create species-specific farms.

- [ ] **5.1: Farm switcher UI** — M
  - AppHeader shows farm pill with species emoji: `🐄 Botha Cattle ▾`
  - Tap → dropdown of user's farms (from `/api/auth/my-farms`)
  - Switch calls `/api/auth/switch-farm/:id`, stores new JWT
  - Single-farm users: pill hidden
  - Stores last-used farm in localStorage
  - Files: `client/src/components/organisms/AppHeader.vue`, `client/src/stores/auth.js`
  - Depends on: 2.7
  - Verify: user on 2 farms can switch, JWT updates, data refreshes

- [ ] **5.2: Farm creation — species selection** — M
  - `CreateFarmView` includes species dropdown (single select)
  - Selected species determines which defaults get seeded
  - Sheep farm auto-disables `milkRecording` feature flag
  - Files: `client/src/views/super/CreateFarmView.vue`
  - Depends on: 2.6
  - Verify: create sheep farm → sheep breeds, sheep issue types, milkRecording off

- [ ] **5.3: Super-admin species management** — M
  - New view: `super/SpeciesManagementView.vue`
  - List species, view/edit config (terminology, life phases, event types)
  - Add new species (future: goats)
  - Files: `client/src/views/super/SpeciesManagementView.vue`, router
  - Depends on: 2.1
  - Verify: super-admin can view/edit species config

- [ ] **5.4: Farm detail — species display** — S
  - `FarmDetailView` shows farm's species with emoji
  - Files: `client/src/views/super/FarmDetailView.vue`
  - Depends on: 5.2
  - Verify: farm detail shows species

- [ ] **5.5: Global defaults — species-aware push UI** — S
  - `PushDefaultsView` filters by species
  - Push only to farms matching selected species
  - Files: `client/src/views/super/PushDefaultsView.vue`
  - Depends on: 2.8
  - Verify: sheep defaults push only to sheep farms

---

## Phase 6: Testing & Hardening

**Goal:** Full test coverage, backward compatibility verified.

- [ ] **6.1: Backend tests — species + breed types** — M
  - Species endpoint returns correct data
  - Breed types filter by species
  - Cows auto-set species_id from breed_type
  - Files: `server/tests/species.test.js`, update `server/tests/breedTypes.test.js`
  - Depends on: Phase 2
  - Verify: all tests pass

- [ ] **6.2: Backend tests — breeding events + offspring** — M
  - Lambing/ram_service event types accepted
  - offspring_count stored correctly
  - registered_offspring count returned
  - birth_event_id linking works on cows
  - Files: update `server/tests/breedingEvents.test.js`, `server/tests/cows.test.js`
  - Depends on: 2.5
  - Verify: all tests pass

- [ ] **6.3: Backend tests — farm creation + switcher** — M
  - Farm created with species → correct defaults seeded
  - Farm switcher: user can list farms, switch, get correct JWT
  - Farm switcher: user can't switch to unauthorized farm
  - Files: update `server/tests/farms.test.js`, `server/tests/auth.test.js`
  - Depends on: 2.6, 2.7
  - Verify: all tests pass

- [ ] **6.4: Frontend tests — species store + composable** — M
  - Species store fetch + cache + fallback
  - useSpeciesTerms returns correct terms per species
  - computeLifePhase with sheep config
  - Files: `client/src/tests/species.store.test.js`, `client/src/tests/useSpeciesTerms.test.js`
  - Depends on: Phase 3
  - Verify: all tests pass

- [ ] **6.5: Frontend tests — view updates** — M
  - Update existing view tests for renamed i18n keys (`cows.*` → `animals.*`)
  - Test offspring mode in CowFormView
  - Test farm switcher in AppHeader
  - Files: update relevant test files
  - Depends on: Phase 4, Phase 5
  - Verify: all 1200+ existing tests still pass

- [ ] **6.6: Backward compatibility verification** — S
  - Existing cattle farms work unchanged after migration
  - No data loss
  - Feature flags still control milking
  - Sync pull backward compatible
  - Files: manual testing checklist
  - Depends on: all phases
  - Verify: existing production deployment unaffected

---

## Test Matrix

| Codepath / Flow                      | Happy path                 | Error path             | Edge case                   | Test exists? |
| ------------------------------------ | -------------------------- | ---------------------- | --------------------------- | ------------ |
| GET /api/species                     | Returns cattle + sheep     | Empty DB               | Inactive species filtered   | [ ]          |
| GET /api/breed-types?species_id      | Returns filtered breeds    | Invalid species_id     | No breeds for species       | [ ]          |
| POST /api/cows (with species)        | Auto-sets species_id       | Missing breed_type     | Breed type has no species   | [ ]          |
| POST /api/cows (with birth_event_id) | Links to birth event       | Invalid birth_event_id | birth_event from other farm | [ ]          |
| POST /api/breeding-events (lambing)  | Creates lambing event      | Invalid event type     | Lambing on cattle farm      | [ ]          |
| Birth event offspring_count          | Count stored on event      | Count = 0 rejected     | Count > species max         | [ ]          |
| Offspring registration (form loop)   | 2 animals created + linked | Duplicate tag on 2nd   | Skip all offspring          | [ ]          |
| Incomplete offspring indicator       | Shows "1 of 2 registered"  | Birth event deleted    | offspring_count = 0         | [ ]          |
| Farm creation with species           | Seeds correct defaults     | Invalid species_id     | Species deactivated         | [ ]          |
| Farm switcher — list farms           | Returns assigned farms     | No other farms         | User deactivated on farm    | [ ]          |
| Farm switcher — switch               | New JWT issued             | Unauthorized farm      | Same farm (no-op)           | [ ]          |
| computeLifePhase (sheep)             | Returns lamb/ewe/ram       | No species config      | Missing dob                 | [ ]          |
| Species terminology in UI            | Shows "Ewe" for sheep      | Store not loaded yet   | Cattle fallback             | [ ]          |

## Failure Modes

| Codepath                    | Failure scenario                               | Covered by test? | Error handling?            | Silent failure?    |
| --------------------------- | ---------------------------------------------- | ---------------- | -------------------------- | ------------------ |
| species.config JSON parse   | Malformed JSON in species config               | No → add         | Need try/catch             | Yes → CRITICAL     |
| species_id null on old data | Pre-migration cows have no species             | No → add         | Fallback to cattle         | Yes → CRITICAL     |
| Breed type without species  | Admin creates breed type, no species set       | No → add         | Default to farm's species  | No                 |
| Offspring form refresh      | User refreshes mid-loop (offspring 2 of 3)     | No → add         | Query params persist state | Yes → handle       |
| Offspring orphaned          | Birth event deleted after offspring registered | No → add         | birth_event_id dangling FK | No (animals exist) |
| i18n vars not loaded        | Species terms not fetched yet                  | No → add         | Fallback to "Animal"       | Yes → handle       |
| Farm switcher — stale JWT   | Switch farm but old token cached               | No → add         | Force token refresh        | Yes → CRITICAL     |

**Critical gaps to address:**

1. JSON.parse guard on species.config (try/catch, return cattle default)
2. Null species_id fallback to cattle for backward compat
3. i18n fallback when species store hasn't loaded yet
4. Farm switcher must clear all stores/caches on switch

## Performance Notes

- Species table is tiny (2-5 rows) — cache aggressively, fetch once on app load
- `species_id` on `cows` avoids JOIN to `breed_types` → `species` on every list query
- No N+1 risk: species config loaded once, used everywhere
- Farm switcher: must clear IndexedDB + Pinia stores on switch (different farm_id scoping)

---

## Migration Summary

**Migration 035: add_species**

- CREATE `species` (id, code, name, config, is_active, sort_order, created_at, updated_at)
- CREATE `farm_species` (farm_id FK, species_id FK, PRIMARY KEY)
- ALTER `breed_types` ADD `species_id` (nullable FK → species)
- ALTER `default_breed_types` ADD `species_id` (nullable FK → species)
- ALTER `cows` ADD `species_id` (nullable FK → species)
- ALTER `cows` ADD `birth_event_id` (nullable FK → breeding_events)
- ALTER `breeding_events` ADD `offspring_count` (integer, default 1)
- SEED species: cattle + sheep (with config JSON)
- SEED default_breed_types: 4 sheep breeds
- SEED default_issue_types: 5 sheep-specific
- SEED default_medications: 3 sheep-specific
- BACKFILL: species_id = cattle on all existing breed_types, default_breed_types, cows
- BACKFILL: farm_species row for all existing farms → cattle

## Sheep Breed Reference Data

| Breed            | Gestation | Heat Cycle | Preg Check | VWD | Dry Off | Young Max Mo | Female Min Mo | Male Min Mo |
| ---------------- | --------- | ---------- | ---------- | --- | ------- | ------------ | ------------- | ----------- |
| Dorper           | 150       | 17         | 30         | 60  | 0       | 6            | 8             | 8           |
| Meatmaster       | 150       | 17         | 30         | 60  | 0       | 6            | 8             | 8           |
| SA Mutton Merino | 150       | 17         | 30         | 60  | 0       | 6            | 8             | 8           |
| Dohne Merino     | 150       | 17         | 30         | 60  | 0       | 6            | 8             | 8           |

Note: `dry_off_days: 0` for meat sheep. Existing `heifer_min_months` / `young_bull_min_months` columns reused — same DB columns, species-aware labels.

## Estimated Effort

| Phase                    | Tasks  | New files              | Modified files       | Tests             |
| ------------------------ | ------ | ---------------------- | -------------------- | ----------------- |
| 1: DB Foundation         | 3      | 1 migration            | 1 (farmSeedService)  | migration test    |
| 2: Backend               | 9      | 1 route (species)      | 7 routes             | ~35 new           |
| 3: Frontend Engine       | 5      | 2 (store + composable) | 3 (i18n × 2, config) | ~15 new           |
| 4: Frontend UI           | 10     | 0                      | 12 views/components  | ~25 updated       |
| 5: Farm Switcher + Admin | 5      | 1 view                 | 4 views/components   | ~15 new           |
| 6: Testing               | 6      | 2 test files           | 8 test files         | ~80 total         |
| **Total**                | **38** | **7 new files**        | **~35 modified**     | **~80 new tests** |
