# Herd Management — Batch Create + Bulk Delete

> Admin-only settings view for rapidly onboarding a herd and fixing mistakes.
> Branch: `feature/herd-management`

## Scope

### In scope

- `POST /api/animals/batch` — create up to 500 animals in one transaction with shared defaults (breed, sex, status, species) + per-row tag_number
- `POST /api/animals/batch-delete` — soft-delete multiple animals by ID in one transaction (admin only)
- `client/src/views/admin/HerdManagement.vue` — new admin view with:
  - **Batch Create section:** shared defaults form + textarea for tags (with chip preview + duplicate highlighting) + submit
  - **Bulk Delete section:** full paginated/searchable animal list + checkboxes + `ConfirmDialog`
- Route: `/admin/herd` with `meta: { requiresAuth: true, requiresAdmin: true }`
- Settings link: "Herd Management" row in admin tools section of [SettingsView.vue](../client/src/views/admin/SettingsView.vue)
- Empty-state CTA in [AnimalListView.vue](../client/src/views/AnimalListView.vue): "Set up your herd →" button (admin only, when no filters active)
- i18n: new `herdManagement` namespace in en + af
- API docs update in [CLAUDE.md](../CLAUDE.md)

### Out of scope

- **CSV/Excel import** — planned as a separate feature; HerdManagement view leaves space for it
- **Auto-number fallback** (RAM-001…) — dropped; farmer enters all tags manually
- **"Select mode" on the daily AnimalListView** — bulk delete lives only in HerdManagement
- **Offline queue for batch ops** — batch create/delete is **online-only**; admin operation run during setup, connectivity assumed
- **Undo bulk delete** — existing soft-delete + audit log is sufficient

### Assumptions

- Backend schema already supports this: only `tag_number` is required on animals (confirmed in [server/routes/animals.ts:30-49](../server/routes/animals.ts#L30-L49))
- `authorize('can_manage_animals')` for create, `requireAdmin` for delete — matches existing handlers
- Audit log action must be `'create' | 'update' | 'delete'` (see [server/services/auditService.ts:8](../server/services/auditService.ts#L8))

## What already exists

- [server/routes/animals.ts:30-49](../server/routes/animals.ts#L30-L49) — `animalSchema`: only `tag_number` required
- [server/routes/animals.ts:314-362](../server/routes/animals.ts#L314-L362) — single-create handler with species auto-resolution (we loop this inside a transaction)
- [server/routes/animals.ts:408-429](../server/routes/animals.ts#L408-L429) — soft-delete pattern with `deleted_at`
- [client/src/stores/animals.ts](../client/src/stores/animals.ts) — Pinia store with IndexedDB fallback
- [client/src/views/admin/SettingsView.vue](../client/src/views/admin/SettingsView.vue) — Admin Tools section with RouterLinks
- [client/src/views/AnimalListView.vue:220-225](../client/src/views/AnimalListView.vue#L220-L225) — empty state exists; we augment it
- `ConfirmDialog` molecule — reuse for bulk delete confirmation
- `resolveError` + `useToast` pattern for error handling

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  SettingsView                                               │
│    └─→ "Herd Management" (layers icon)                      │
│          ↓                                                  │
│  /admin/herd → HerdManagement.vue (new)                     │
│  ┌────────────────────────┐  ┌───────────────────────────┐  │
│  │ Batch Create section   │  │ Bulk Delete section       │  │
│  │  - defaults form       │  │  - paginated animal list  │  │
│  │  - tag textarea        │  │  - search input           │  │
│  │  - chip preview        │  │  - checkboxes per row     │  │
│  │  - duplicate highlight │  │  - select all / clear     │  │
│  │  - submit (≥1 valid)   │  │  - ConfirmDialog          │  │
│  └──────────┬─────────────┘  └───────────┬───────────────┘  │
│             ↓                            ↓                  │
│     animalsStore.batchCreate()   animalsStore.batchDelete() │
└─────────────┬──────────────────────────────┬────────────────┘
              ↓                              ↓
        POST /api/animals/batch     POST /api/animals/batch-delete
              ↓                              ↓
      db.transaction:              db.transaction:
        - dedupe check               - verify all IDs belong to farm
        - existing-tag check         - UPDATE deleted_at WHERE id IN (…)
        - INSERT N rows              - N × logAudit('delete')
        - N × logAudit('create')
              ↓                              ↓
                          animals table
```

### Key decisions

- **Audit logging:** log **N individual `create`/`delete` entries** inside the transaction — matches existing `action: 'create' | 'update' | 'delete'` type contract in [auditService.ts:8](../server/services/auditService.ts#L8). 20 audit rows per batch is acceptable for a rare admin operation.
- **Species resolution:** look up `breed_type.species_id` **once** before the loop (not per row).
- **Single transaction per endpoint:** all-or-nothing; if any insert fails, roll back and return conflict list so farmer can fix + resubmit.
- **Duplicate detection:** two phases, both before the transaction —
  1. Dedupe within the submitted `tags` array → return 400 with list if any duplicates
  2. `SELECT tag_number WHERE tag_number IN (...) AND farm_id = ? AND deleted_at IS NULL` → return 409 with existing list
- **Online-only:** store actions fail fast if offline; error surfaced via toast.
- **Tag input UX:** single textarea accepting comma/space/newline-separated tags, live chip preview below, duplicates highlighted red, invalid (empty/too long) filtered out.
- **Max batch size: 500** enforced via `Joi.array().max(500)`.
- **Bulk delete list:** all animals, paginated + searchable (reuses existing `GET /api/animals?search=&page=&limit=` pattern).
- **Empty-state CTA:** shown only when `displayedAnimals.length === 0 && !hasActiveFilters && isAdmin`.
- **Icon:** `layers` for Herd Management row (avoids collision with `cow` icon already used for Breed Types).

## Tasks

- [ ] **Task 1: Backend `POST /api/animals/batch`**
  - Add to [server/routes/animals.ts](../server/routes/animals.ts) after existing POST handler
  - Joi schema:
    ```ts
    const batchSchema = Joi.object({
      defaults: Joi.object({
        sex: Joi.string().valid('female', 'male').required(),
        status: Joi.string()
          .valid(...ANIMAL_STATUSES)
          .default('active'),
        breed_type_id: Joi.string().max(36).allow(null, ''),
      }).required(),
      tags: Joi.array().items(Joi.string().max(50).required()).min(1).max(500).required(),
    })
    ```
  - Flow:
    1. Validate body
    2. Dedupe `tags` array → 400 if duplicates within batch
    3. Query existing tags in farm → 409 if any exist
    4. Resolve `species_id` once from `breed_type_id` (or farm default)
    5. `db.transaction` → `INSERT` all + N × `logAudit('create')`
    6. Return `{ created: N, animals: [...] }`
  - Permission: `authorize('can_manage_animals')`
  - Complexity: M
  - Files: [server/routes/animals.ts](../server/routes/animals.ts)
  - Depends on: nothing
  - Verify: unit test — create 10 animals, check DB + audit log + response

- [ ] **Task 2: Backend `POST /api/animals/batch-delete`**
  - Joi: `{ ids: Joi.array().items(Joi.string().uuid()).min(1).max(500).required() }`
  - Flow:
    1. Validate body
    2. `SELECT id FROM animals WHERE id IN (...) AND farm_id = ? AND deleted_at IS NULL` → 404 if count mismatch (any ID not in farm or already deleted)
    3. `db.transaction` → `UPDATE ... SET deleted_at = ? WHERE id IN (...)` + N × `logAudit('delete')`
    4. Return `{ deleted: N }`
  - Permission: `requireAdmin`
  - Complexity: S
  - Files: [server/routes/animals.ts](../server/routes/animals.ts)
  - Depends on: nothing
  - Verify: unit test — soft-delete 5, cross-farm IDs rejected, non-admin 403

- [ ] **Task 3: Backend tests**
  - Add to [server/tests/animals.test.ts](../server/tests/animals.test.ts):
    - Batch create happy path (10 animals)
    - Duplicate within batch → 400
    - Duplicate vs existing herd → 409
    - Missing `tag_number` in array → 400
    - > 500 rows → 400
    - Worker forbidden for batch-delete → 403
    - Cross-farm ID rejection → 404
    - Audit log: N create rows written for batch
  - Complexity: M
  - Files: [server/tests/animals.test.ts](../server/tests/animals.test.ts)
  - Depends on: Task 1, 2
  - Verify: `npm test -- --testPathPattern=animals` — all new tests pass

- [ ] **Task 4: Animals store `batchCreate` + `batchDelete`**
  - Add two actions to [client/src/stores/animals.ts](../client/src/stores/animals.ts):
    ```ts
    async function batchCreate(payload: { defaults: {...}, tags: string[] }) {
      // online-only — throws on network failure
      const { data } = await api.post('/animals/batch', payload)
      // merge into local state + IndexedDB
      await db.animals.bulkPut(data.animals)
      animals.value.push(...data.animals)
      return data
    }
    async function batchDelete(ids: string[]) {
      await api.post('/animals/batch-delete', { ids })
      animals.value = animals.value.filter(a => !ids.includes(a.id))
      await db.animals.bulkDelete(ids)
    }
    ```
  - Complexity: S
  - Files: [client/src/stores/animals.ts](../client/src/stores/animals.ts)
  - Depends on: Task 1, 2
  - Verify: unit test in [client/src/tests/animals.store.test.ts](../client/src/tests/animals.store.test.ts) — mock API, assert endpoints + state updates

- [ ] **Task 5: `HerdManagement.vue` — Batch Create section**
  - New file: `client/src/views/admin/HerdManagement.vue`
  - Layout:
    - `AppHeader` with `show-back back-to="/settings"`
    - **Shared defaults card:** breed dropdown (from `breedTypesStore`), sex toggle (Male/Female), status dropdown
    - **Tags textarea** with placeholder "Enter tag numbers separated by comma, space, or new line"
    - Computed `parsedTags`: split on `/[,\s]+/`, trim, filter empty
    - **Chip preview** below: `{count} tags` + each tag as chip; duplicates within parsedTags get `.chip-duplicate` class (red)
    - **Submit button** disabled when `parsedTags.length === 0` or duplicates present
    - On submit → `animalsStore.batchCreate({ defaults, tags: parsedTags })`
    - On success → toast "Added N animals", clear textarea, refresh list for delete section
    - On error → `toast.error(resolveError(extractApiError(err), t))`; if 409, show list of existing tags for farmer to remove
  - Complexity: L
  - Files: new `client/src/views/admin/HerdManagement.vue`
  - Depends on: Task 4
  - Verify: component test — fill form, submit, assert store called with correct payload; duplicate detection in chips

- [ ] **Task 6: `HerdManagement.vue` — Bulk Delete section**
  - Same file as Task 5, below batch create card
  - Layout:
    - Section header "Remove Animals"
    - `SearchInput` molecule (reuse existing)
    - Paginated animal list — fetch via `animalsStore.fetchPaginated()` or direct API call with `?page=&limit=20&search=`
    - Each row: checkbox + tag_number + name + sex badge
    - Bottom bar when `selectedIds.length > 0`: "Delete N animals" button
    - Click → show `ConfirmDialog` with message `t('herdManagement.confirmDelete', { count })` + sample tags
    - On confirm → `animalsStore.batchDelete(selectedIds)` → toast, refresh list, clear selection
  - Complexity: M
  - Files: same as Task 5
  - Depends on: Task 4, 5
  - Verify: component test — select 3 rows, confirm dialog appears, on confirm `batchDelete` called with correct IDs

- [ ] **Task 7: Route + Settings link**
  - [client/src/router/index.ts](../client/src/router/index.ts) — add lazy-loaded route:
    ```ts
    {
      path: '/admin/herd',
      name: 'herd-management',
      component: () => import('../views/admin/HerdManagement.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
    }
    ```
  - [client/src/views/admin/SettingsView.vue](../client/src/views/admin/SettingsView.vue) — add RouterLink in admin tools section:
    ```vue
    <RouterLink to="/admin/herd" class="settings-item">
      <span class="settings-icon">
        <AppIcon name="layers" :size="20" :stroke-width="1.5" />
      </span>
      <div class="settings-info">
        <span class="settings-name">{{ t('herdManagement.title') }}</span>
        <span class="settings-desc">{{ t('settings.herdManagementDesc') }}</span>
      </div>
      <span class="settings-arrow">
        <AppIcon name="chevron-right" :size="16" :stroke-width="2" />
      </span>
    </RouterLink>
    ```
  - Complexity: S
  - Files: `client/src/router/index.ts`, `client/src/views/admin/SettingsView.vue`
  - Depends on: Task 5
  - Verify: manual nav — Settings → Herd Management loads the view; non-admin redirected

- [ ] **Task 8: Empty-state CTA in AnimalListView**
  - Modify [client/src/views/AnimalListView.vue:220-225](../client/src/views/AnimalListView.vue#L220-L225) empty state
  - Add computed `hasActiveFilters` if not present (check status/sex/breed/search)
  - Add computed `isAdmin` via `authStore.isAdmin` or `authStore.user.role === 'admin'`
  - When `displayedAnimals.length === 0 && !hasActiveFilters && isAdmin`, append a prominent "Set up your herd →" RouterLink to `/admin/herd`
  - Complexity: S
  - Files: [client/src/views/AnimalListView.vue](../client/src/views/AnimalListView.vue)
  - Depends on: Task 7
  - Verify: test — admin + empty + no filters → CTA shown; worker → CTA hidden; admin + filters active → CTA hidden

- [ ] **Task 9: i18n strings**
  - [client/src/i18n/en.json](../client/src/i18n/en.json) and [client/src/i18n/af.json](../client/src/i18n/af.json)
  - Add `herdManagement` namespace:
    ```json
    "herdManagement": {
      "title": "Herd Management",
      "batchCreateTitle": "Add Animals in Bulk",
      "sharedDefaults": "Shared defaults",
      "tagsLabel": "Tag numbers",
      "tagsPlaceholder": "Enter tag numbers separated by comma, space, or new line",
      "tagsHint": "{count} tags ready",
      "duplicateTags": "{count} duplicate tag(s) — fix before submitting",
      "existingTags": "These tags already exist: {tags}",
      "addCount": "Add {count} animals",
      "addedSuccess": "{count} animals added",
      "bulkDeleteTitle": "Remove Animals",
      "selectAll": "Select all",
      "clearSelection": "Clear",
      "deleteCount": "Delete {count} animals",
      "confirmDelete": "Delete {count} animals? This can be restored by an admin.",
      "deletedSuccess": "{count} animals removed",
      "emptyListSetupCta": "Set up your herd →"
    }
    ```
  - Add `settings.herdManagementDesc`: "Add animals in bulk or remove multiple at once"
  - Both locales must have identical key trees
  - Complexity: S
  - Files: `client/src/i18n/en.json`, `client/src/i18n/af.json`
  - Depends on: Task 5, 7, 8
  - Verify: vue-i18n no missing-key warnings

- [ ] **Task 10: Update CLAUDE.md API docs**
  - Add to the API Conventions list in [CLAUDE.md](../CLAUDE.md):
    - `POST /api/animals/batch` — body `{ defaults: { sex, status, breed_type_id? }, tags: [...] }`; max 500 per batch; rejects duplicates within batch (400) or existing (409); requires `can_manage_animals`; admin-or-worker
    - `POST /api/animals/batch-delete` — body `{ ids: [uuid] }`; max 500 per batch; admin only; soft-delete; all-or-nothing
  - Complexity: S
  - Files: [CLAUDE.md](../CLAUDE.md)
  - Depends on: Task 1, 2
  - Verify: entries present in API conventions section

## Test Matrix

| Codepath / Flow                  | Happy path                           | Error path                           | Edge case                                          | Covered by      |
| -------------------------------- | ------------------------------------ | ------------------------------------ | -------------------------------------------------- | --------------- |
| `POST /api/animals/batch`        | Create 10 animals, 201               | Duplicate within batch → 400         | Empty tags → 400                                   | Task 3          |
| `POST /api/animals/batch`        | Auto-resolves species_id from breed  | Existing tag in farm → 409 with list | > 500 rows → 400                                   | Task 3          |
| `POST /api/animals/batch`        | N audit rows written in tx           | Worker denied → 403                  | Invalid breed_type → 400                           | Task 3          |
| `POST /api/animals/batch-delete` | Delete 5, soft `deleted_at` set      | Non-admin → 403                      | Cross-farm ID → 404                                | Task 3          |
| `POST /api/animals/batch-delete` | N audit rows written in tx           | Non-existent ID → 404                | Empty ids → 400                                    | Task 3          |
| `animalsStore.batchCreate`       | Calls POST, updates state + IDB      | API error → throws, state unchanged  | —                                                  | Task 4          |
| `animalsStore.batchDelete`       | Calls POST, removes from state + IDB | API error → throws                   | —                                                  | Task 4          |
| `HerdManagement.vue` create      | Fill form, submit, success toast     | 409 → show existing tags list        | Duplicate in textarea → chip red + submit disabled | Task 5          |
| `HerdManagement.vue` delete      | Select + confirm + delete            | Cancel dialog → no-op                | Select all / clear all                             | Task 6          |
| Router guard `/admin/herd`       | Admin access                         | Worker redirected                    | —                                                  | Task 7 (manual) |
| AnimalListView empty CTA         | Admin + empty + no filters → shown   | Worker → hidden                      | Filters active → hidden                            | Task 8          |

## Failure Modes

| Codepath                         | Failure scenario                                | Covered by test? | Error handling?                              | Silent failure? |
| -------------------------------- | ----------------------------------------------- | ---------------- | -------------------------------------------- | --------------- |
| `POST /animals/batch`            | Mid-batch unique constraint error               | Yes (Task 3)     | Yes — tx rollback, 409 w/ list               | No              |
| `POST /animals/batch`            | Farmer sends 10,000 rows                        | Yes (Task 3)     | Yes — Joi max 500 → 400                      | No              |
| `POST /animals/batch-delete`     | IDs include one from another farm               | Yes (Task 3)     | Yes — pre-check, 404                         | No              |
| `POST /animals/batch-delete`     | Animal has dependent records (milk, health)     | Partial          | Existing soft-delete behavior — FK untouched | No              |
| `animalsStore.batchCreate`       | Network error                                   | Yes (Task 4)     | Throws → view toast + keep form              | No              |
| `HerdManagement.vue` textarea    | Farmer pastes list with whitespace/commas mixed | Yes (Task 5)     | Regex split `/[,\s]+/` handles both          | No              |
| `HerdManagement.vue` delete list | Herd has 500+ animals                           | —                | Paginated + searchable                       | No              |
| AnimalListView empty CTA         | Shown to worker                                 | Yes (Task 8)     | `isAdmin` check                              | No              |

**Critical gaps:** None.

## Performance

- Batch insert: Knex `.insert(array)` compiles to multi-row INSERT on both SQLite and MySQL — **1 round-trip**, not N
- Species lookup: 1 query before loop (not N)
- Audit log: N rows, but inside the same transaction — single commit
- Max 500 per batch — bounded
- Bulk delete: single `UPDATE ... WHERE id IN (...)` — 1 round-trip
- Bulk delete list UI: paginated (20 per page) — bounded DOM
- Tag textarea chip preview: computed from split string; cap displayed chips at ~500

No perf concerns.

## Rollout

1. Create branch ✓ (`feature/herd-management`)
2. Implement tasks 1–10 in order
3. Run backend + frontend tests
4. Manual smoke test: onboard a fake farm via the batch flow, then bulk delete
5. Commit + PR
