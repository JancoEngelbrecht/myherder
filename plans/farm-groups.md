# Farm Groups — Secure Farm Switching

Farm groups define which farms can share users for farm switching. Only users with the same username on farms within the SAME group can switch between them. This closes a security vulnerability where username collisions across unrelated farms could allow unauthorized cross-farm access.

## Scope

**In scope:**

- Database: `farm_groups` + `farm_group_members` tables (migration 037)
- Backend: Farm groups CRUD API (super-admin only)
- Backend: Harden `GET /api/auth/my-farms` to filter by farm group membership
- Backend: Harden `POST /api/auth/switch-farm/:farmId` to verify group membership via DB
- Backend: Audit log every farm switch
- Frontend: FarmGroupsView super-admin page
- Frontend: Navigation link in super-admin dashboard
- i18n: en.json + af.json `farmGroups` namespace
- Tests: Backend + frontend
- Documentation: CLAUDE.md API docs update

**Out of scope:**

- Changing the farm switcher UI in AppHeader (it already works; we're just restricting which farms appear)
- Super-admin enter-farm flow (unrelated — super-admin uses a separate mechanism)
- Automatic group creation on farm creation (groups are opt-in by super-admin)

---

## Phase 1: Migration + Data Model `(S)`

### Task 1.1 — Create migration 037

- **File:** `server/migrations/037_create_farm_groups.js`
- Create `farm_groups` table:
  - `id` — UUID primary key (use `randomUUID()` on insert)
  - `name` — varchar(100) NOT NULL
  - `created_at` — datetime, default now
  - `updated_at` — datetime, default now
- Create `farm_group_members` table:
  - `id` — UUID primary key
  - `farm_group_id` — UUID NOT NULL, FK → `farm_groups.id` ON DELETE CASCADE
  - `farm_id` — UUID NOT NULL, FK → `farms.id` ON DELETE CASCADE, **UNIQUE** constraint
  - `added_at` — datetime, default now
- Pattern: Follow `server/migrations/033_create_global_defaults.js` structure
- **Verify:** `npm run migrate` succeeds; tables exist in SQLite

### Task 1.2 — Add cleanup to farm DELETE cascade

- **File:** `server/routes/farms.js` (DELETE /:id handler)
- Add `await trx('farm_group_members').where('farm_id', farm.id).del()` before `await trx('farms').where('id', farm.id).del()`
- After deletion, check if any group now has fewer than 2 members and auto-delete those groups:
  ```js
  const underMinGroups = await trx('farm_groups')
    .leftJoin('farm_group_members as m', 'farm_groups.id', 'm.farm_group_id')
    .groupBy('farm_groups.id')
    .havingRaw('COUNT(m.id) < 2')
    .select('farm_groups.id')
  if (underMinGroups.length > 0) {
    const groupIds = underMinGroups.map((g) => g.id)
    await trx('farm_group_members').whereIn('farm_group_id', groupIds).del()
    await trx('farm_groups').whereIn('id', groupIds).del()
  }
  ```

---

## Phase 2: Backend API — Farm Groups CRUD `(M)`

### Task 2.1 — Create farm groups route file

- **File:** `server/routes/farmGroups.js`
- Pattern: Copy structure from `server/routes/farms.js` (super-admin only, authenticate + requireSuperAdmin)
- Joi schemas at top level:
  - `createSchema`: `{ name: string(2-100).required, farm_ids: array.items(uuid).min(2).required }`
  - `updateSchema`: `{ name: string(2-100) }.min(1)`
  - `addFarmsSchema`: `{ farm_ids: array.items(uuid).min(1).required }`

### Task 2.2 — GET /api/farm-groups

- Returns all groups with their member farms
- Query: join `farm_groups` → `farm_group_members` → `farms`
- Response shape:
  ```json
  [
    {
      "id": "uuid",
      "name": "Eastern Cape Farms",
      "created_at": "...",
      "updated_at": "...",
      "farms": [
        { "id": "uuid", "name": "Farm A", "code": "FARMA", "is_active": true },
        { "id": "uuid", "name": "Farm B", "code": "FARMB", "is_active": true }
      ]
    }
  ]
  ```

### Task 2.3 — POST /api/farm-groups

- Validate body with `createSchema`
- Check: all farm_ids exist and are active
- Check: none of the farm_ids are already in a group (query `farm_group_members` for any of the IDs)
  - If any are, return 409 with `{ error: 'Farm X is already in a group' }`
- Transaction: insert `farm_groups` row + N `farm_group_members` rows
- Audit log: `action: 'create', entityType: 'farm_group'`
- Return created group with farms (same shape as GET)

### Task 2.4 — PATCH /api/farm-groups/:id

- Validate body with `updateSchema` (name only)
- 404 if group not found
- Update name + updated_at
- Audit log: `action: 'update', entityType: 'farm_group'`
- Return updated group

### Task 2.5 — DELETE /api/farm-groups/:id

- 404 if group not found
- Transaction: delete `farm_group_members` where `farm_group_id`, then delete `farm_groups` row
- Audit log: `action: 'delete', entityType: 'farm_group'`
- Return `{ message: 'Farm group deleted' }`

### Task 2.6 — POST /api/farm-groups/:id/farms

- Validate body with `addFarmsSchema`
- 404 if group not found
- Check: all farm_ids exist and are active
- Check: none of the farm_ids are already in ANY group
- Insert `farm_group_members` rows
- Audit log: `action: 'update', entityType: 'farm_group', newValues: { added_farm_ids: [...] }`
- Return updated group with farms

### Task 2.7 — DELETE /api/farm-groups/:id/farms/:farmId

- 404 if group not found
- 404 if farm not in this group
- Delete the `farm_group_members` row
- Count remaining members — if < 2, auto-delete the entire group
  - Delete remaining `farm_group_members` + `farm_groups` row
  - Return `{ message: 'Farm removed. Group deleted (below minimum of 2 farms).' }`
- Otherwise return updated group with farms
- Audit log: `action: 'update', entityType: 'farm_group', newValues: { removed_farm_id: farmId }`

### Task 2.8 — Mount route in app.js

- **File:** `server/app.js`
- Add: `app.use('/api/farm-groups', require('./routes/farmGroups'))`
- Place after the `/api/farms` line

---

## Phase 3: Security Hardening — my-farms + switch-farm `(M)`

### Task 3.1 — Harden GET /api/auth/my-farms

- **File:** `server/routes/auth.js` (line ~450)
- Current behavior: returns ALL farms where user has same username — **this is the vulnerability**
- New behavior:
  1. Get the user's current `farm_id` from JWT (`req.user.farm_id`)
  2. Look up which `farm_group` the current farm belongs to (query `farm_group_members`)
  3. If the current farm is NOT in any group → return empty array (no switching allowed)
  4. If it IS in a group → get all farm_ids in that group from `farm_group_members`
  5. Filter: only return farms where BOTH conditions are met:
     - Farm is in the same group as current farm
     - User has an active account on that farm (same username)
  6. Include the current farm in the result (so the switcher shows which farm is active)
- Edge case: super-admin users are excluded (keep existing `whereNot('role', 'super_admin')`)
- Edge case: if `req.user.farm_id` is null (super-admin without farm context), return empty array

### Task 3.2 — Harden POST /api/auth/switch-farm/:farmId

- **File:** `server/routes/auth.js` (line ~496)
- After verifying `targetUser` exists, add a farm group check:
  1. Query `farm_group_members` for the source farm (`req.user.farm_id`)
  2. Query `farm_group_members` for the target farm (`targetFarmId`)
  3. If either is not in a group, OR they are in different groups → return 403 `{ error: 'Farms are not in the same group' }`
  4. Only proceed if both farms share the same `farm_group_id`
- This is a DB lookup, not JWT-based — cannot be spoofed

### Task 3.3 — Add audit logging to switch-farm

- **File:** `server/routes/auth.js` (in switch-farm handler, after issuing the token)
- Import `logAudit` from `../services/auditService`
- Log:
  ```js
  await logAudit({
    farmId: targetFarmId,
    userId: req.user.id,
    action: 'switch_farm',
    entityType: 'farm',
    entityId: targetFarmId,
    oldValues: { from_farm_id: req.user.farm_id },
    newValues: { to_farm_id: targetFarmId },
  })
  ```

---

## Phase 4: Frontend — FarmGroupsView `(M)`

### Task 4.1 — Create FarmGroupsView

- **File:** `client/src/views/super/FarmGroupsView.vue`
- Pattern: Follow `client/src/views/super/FarmListView.vue` structure
- Template:
  - AppHeader with title from i18n, `show-back back-to="/"`
  - "Create Group" button (opens inline form)
  - List of groups as `.card` elements, each showing:
    - Group name (editable via edit button)
    - Member farms as chips/badges (farm name + farm code)
    - "Add Farm" button per group (shows dropdown of eligible unassigned farms)
    - "Remove" button per farm chip (with ConfirmDialog if group would be deleted)
    - "Delete Group" button (with ConfirmDialog)
  - Empty state when no groups exist
- Script:
  - `api.get('/farm-groups')` on mount
  - `api.post('/farm-groups', { name, farm_ids })` for create
  - `api.patch('/farm-groups/:id', { name })` for rename
  - `api.delete('/farm-groups/:id')` for delete
  - `api.post('/farm-groups/:id/farms', { farm_ids })` for add farm
  - `api.delete('/farm-groups/:id/farms/:farmId')` for remove farm
  - Fetch available farms via `api.get('/farms')` to populate the "add farm" dropdown
  - Filter out farms that are already in any group
- Use ConfirmDialog for delete actions (required by project convention)
- Use `extractApiError` + `resolveError` + `useToast` for error handling

### Task 4.2 — Add route

- **File:** `client/src/router/index.js`
- Add after the existing super-admin routes:
  ```js
  {
    path: '/super/farm-groups',
    name: 'FarmGroups',
    component: () => import('../views/super/FarmGroupsView.vue'),
    meta: { requiresAuth: true, requiresSuperAdmin: true },
  },
  ```

### Task 4.3 — Add navigation link in DashboardView

- **File:** `client/src/views/DashboardView.vue`
- In the super-admin actions grid, add a new action card:
  ```html
  <RouterLink to="/super/farm-groups" class="action-card active-action">
    <span class="action-icon">🔗</span>
    <span class="action-label">{{ t('farmGroups.title') }}</span>
  </RouterLink>
  ```

### Task 4.4 — Add i18n keys

- **Files:** `client/src/i18n/en.json` and `client/src/i18n/af.json`
- Add `farmGroups` namespace:
  ```json
  "farmGroups": {
    "title": "Farm Groups",
    "createGroup": "Create Group",
    "editGroup": "Edit Group",
    "deleteGroup": "Delete Group",
    "groupName": "Group Name",
    "addFarm": "Add Farm",
    "removeFarm": "Remove Farm",
    "noGroups": "No farm groups yet",
    "minTwoFarms": "A group needs at least 2 farms",
    "farmAlreadyInGroup": "This farm is already in a group",
    "confirmDeleteGroup": "Delete this farm group? Farms will no longer be able to switch between each other.",
    "confirmRemoveFarm": "Remove this farm from the group? If only 1 farm remains, the group will be deleted.",
    "groupCreated": "Farm group created",
    "groupUpdated": "Farm group updated",
    "groupDeleted": "Farm group deleted",
    "farmAdded": "Farm added to group",
    "farmRemoved": "Farm removed from group",
    "selectFarms": "Select farms",
    "availableFarms": "Available farms",
    "memberFarms": "Member farms",
    "groupDeletedAutomatic": "Group auto-deleted (below minimum of 2 farms)"
  }
  ```
- Afrikaans equivalents in af.json

---

## Phase 5: Testing `(M)`

### Task 5.1 — Backend tests for farm-groups CRUD

- **File:** `server/tests/farmGroups.test.js`
- Pattern: Follow `server/tests/farms.test.js` structure
- Setup: seed super_admin + seed 3-4 farms
- Tests:
  1. `GET /api/farm-groups` — returns empty array initially
  2. `GET /api/farm-groups` — returns groups with farms after creation
  3. `POST /api/farm-groups` — creates group with 2+ farms
  4. `POST /api/farm-groups` — rejects fewer than 2 farms (400)
  5. `POST /api/farm-groups` — rejects farm already in a group (409)
  6. `POST /api/farm-groups` — rejects non-existent farm_ids (400)
  7. `PATCH /api/farm-groups/:id` — updates name
  8. `PATCH /api/farm-groups/:id` — 404 for missing group
  9. `DELETE /api/farm-groups/:id` — deletes group and members
  10. `POST /api/farm-groups/:id/farms` — adds farm to group
  11. `POST /api/farm-groups/:id/farms` — rejects farm already in another group
  12. `DELETE /api/farm-groups/:id/farms/:farmId` — removes farm
  13. `DELETE /api/farm-groups/:id/farms/:farmId` — auto-deletes group when < 2 remain
  14. All endpoints reject non-super-admin (403)
  15. All endpoints reject admin token (403)

### Task 5.2 — Backend tests for my-farms group filtering

- **File:** `server/tests/farmGroups.test.js` (add section)
- Setup: 3 farms (A, B, C), user "sipho" on all 3, group containing A + B only
- Tests:
  1. `GET /api/auth/my-farms` with token for farm A → returns [A, B] (not C)
  2. `GET /api/auth/my-farms` with token for farm C → returns [] (C not in any group)
  3. `GET /api/auth/my-farms` for user on only 1 farm in group → returns that farm + groupmates where user exists

### Task 5.3 — Backend tests for switch-farm group verification

- Setup: 3 farms (A, B, C), user "sipho" on all 3, group containing A + B only
- Tests:
  1. `POST /api/auth/switch-farm/:farmB` with token for farm A → 200 (same group)
  2. `POST /api/auth/switch-farm/:farmC` with token for farm A → 403 (different group / no group)
  3. `POST /api/auth/switch-farm/:farmA` with token for farm C → 403 (C not in any group)
  4. Verify audit log entry created on successful switch

### Task 5.4 — Frontend tests for FarmGroupsView

- **File:** `client/src/tests/FarmGroupsView.test.js`
- Pattern: Follow `client/src/tests/FarmListView.test.js`
- Mock api calls
- Tests:
  1. Renders empty state when no groups
  2. Renders group cards with farm chips
  3. Create group flow (form submit)
  4. Delete group with ConfirmDialog
  5. Add farm to group
  6. Remove farm from group

---

## Phase 6: Documentation `(S)`

### Task 6.1 — Update CLAUDE.md API docs

- Add farm-groups API documentation section
- Update `GET /api/auth/my-farms` docs to note group filtering
- Update `POST /api/auth/switch-farm/:farmId` docs to note group verification + audit logging

### Task 6.2 — Update MEMORY.md

- Add farm groups phase status
- Add `farmGroups.js` to route file map
- Add `FarmGroupsView` to views list
- Add test files to test lists

### Task 6.3 — Rebuild client/dist

- Run `cd client && npm run build` to include FarmGroupsView in production bundle
