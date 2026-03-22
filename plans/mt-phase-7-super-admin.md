# MT Phase 7: Super-Admin Panel

## Goal

Build the super-admin management interface: farm CRUD API, farm seeding service, "Enter Farm" functionality, and management views.

## Prerequisites

- Phases 1-6 complete (full backend + frontend multi-tenancy)
- Read `server/routes/users.js` for CRUD pattern reference
- Read `client/src/views/admin/` for admin view patterns
- Read `server/seeds/001_initial_data.js` for seed data structure

## Step 7.1 -- Create `requireSuperAdmin` middleware

**Create** or add to existing middleware:

```js
// server/middleware/requireSuperAdmin.js
module.exports = function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' })
  }
  next()
}
```

## Step 7.2 -- Create farm seed service

**Create** `server/services/farmSeedService.js`:

Seeds default data for a newly created farm. Called by the farm creation endpoint.

```js
async function seedFarmDefaults(farmId, trx) {
  // Uses transaction (trx) so all seeding is atomic

  // 1. Default breed types (copy from seed data constants)
  const defaultBreedTypes = [
    { id: uuid(), farm_id: farmId, name: 'Holstein', code: 'holstein', ... },
    { id: uuid(), farm_id: farmId, name: 'Jersey', code: 'jersey', ... },
    // ... standard breeds
  ];
  await trx('breed_types').insert(defaultBreedTypes);

  // 2. Default issue types
  const defaultIssueTypes = [
    { id: uuid(), farm_id: farmId, name: 'Mastitis', code: 'mastitis', emoji: '...', ... },
    // ... standard issue types
  ];
  await trx('issue_type_definitions').insert(defaultIssueTypes);

  // 3. Default medications
  const defaultMedications = [...];
  await trx('medications').insert(defaultMedications);

  // 4. Default feature flags (all enabled)
  const flags = ['breeding', 'milk_recording', 'health_issues', 'treatments', 'analytics'];
  await trx('feature_flags').insert(flags.map(key => ({ farm_id: farmId, key, enabled: true })));

  // 5. Default app settings
  await trx('app_settings').insert([
    { farm_id: farmId, key: 'farm_name', value: name },
    { farm_id: farmId, key: 'default_language', value: 'en' }
  ]);
}
```

Extract seed data constants from `server/seeds/001_initial_data.js` into a shared `server/seeds/defaults.js` to avoid duplication.

## Step 7.3 -- Create farm CRUD API

**Create** `server/routes/farms.js`:

All endpoints require `super_admin` role.

### `GET /api/farms`

- List all farms with stats
- Join to get user_count, cow_count per farm
- Returns: `[{ id, name, code, slug, is_active, user_count, cow_count, created_at }]`

### `GET /api/farms/:id`

- Farm detail with user list
- Returns: `{ ...farm, users: [{ id, username, full_name, role, is_active }] }`

### `POST /api/farms`

- Body: `{ name, code, admin_username, admin_password, admin_full_name }`
- Validate: code is unique, uppercase, 3-10 chars alphanumeric
- Generate slug from code (lowercase)
- Create farm
- Create admin user for that farm
- Call `seedFarmDefaults(farmId, trx)` within same transaction
- Return: `{ farm, admin_user }`

### `PATCH /api/farms/:id`

- Body: `{ name?, code?, is_active? }`
- Validate: if code changed, new code is unique
- Update farm

### `DELETE /api/farms/:id`

- Soft deactivate: `is_active = false`
- Does NOT delete data
- Deactivated farm users cannot log in (checked in auth)

### Mount in `server/app.js`:

```js
const farmsRoutes = require('./routes/farms')
app.use('/api/farms', authenticate, requireSuperAdmin, farmsRoutes)
```

## Step 7.4 -- "Enter Farm" functionality

### Backend: `POST /api/farms/:id/enter`

- Super-admin only
- Find farm by ID, verify it's active
- Issue new JWT with `farm_id` set to that farm's ID, role stays `super_admin`
- Return: `{ token }`

### Frontend auth store:

- `enterFarm(farmId)` action:
  - Save current token as `localStorage('super_admin_token')`
  - Call `POST /api/farms/${farmId}/enter`
  - Set new token via `setSession(token)`
  - Navigate to `/` (dashboard)

- `exitFarm()` action:
  - Restore token from `localStorage('super_admin_token')`
  - Clear `super_admin_token`
  - Call `setSession(originalToken)`
  - Navigate to `/super/farms`

- Computed `isInFarmContext`: `super_admin_token` exists in localStorage and differs from current token

## Step 7.5 -- Super-admin views

### `client/src/views/super/FarmListView.vue`

- Route: `/super/farms`
- Table: Name, Code, Status (active/inactive badge), Users, Cows, Created
- Actions per row: View, Enter Farm
- Header: "Create Farm" button -> `/super/farms/new`
- Back button: `back-to="/"`

### `client/src/views/super/FarmDetailView.vue`

- Route: `/super/farms/:id`
- Farm info: name, code, status, created date
- Edit inline (name, code, is_active toggle)
- User list with "Revoke Sessions" per user
- "Revoke All Farm Sessions" button
- "Enter Farm" button
- Back button: `back-to="/super/farms"`

### `client/src/views/super/CreateFarmView.vue`

- Route: `/super/farms/new`
- Form: Farm name, Farm code (auto-generated from name, editable, uppercase), Admin username, Admin password, Admin full name
- Submit -> `POST /api/farms`
- On success: navigate to `/super/farms/:id`
- Back button: `back-to="/super/farms"`

## Step 7.6 -- Router updates

Add to `client/src/router/index.js`:

```js
{
  path: '/super/farms',
  component: () => import('./views/super/FarmListView.vue'),
  meta: { requiresAuth: true, requiresSuperAdmin: true }
},
{
  path: '/super/farms/new',
  component: () => import('./views/super/CreateFarmView.vue'),
  meta: { requiresAuth: true, requiresSuperAdmin: true }
},
{
  path: '/super/farms/:id',
  component: () => import('./views/super/FarmDetailView.vue'),
  meta: { requiresAuth: true, requiresSuperAdmin: true }
}
```

Router guard: if `requiresSuperAdmin` and `authStore.user.role !== 'super_admin'`, redirect to `/`.

## Step 7.7 -- Navigation updates

### DashboardView

- When `user.role === 'super_admin' && !farmId`: show "Farms" card linking to `/super/farms`, hide farm-specific cards (Cows, Milking, etc.)
- When `user.role === 'super_admin' && farmId` (entered a farm): show normal dashboard + "Exit Farm" banner at top

### BottomNav

- Hide when super-admin has no farm context (`role === 'super_admin' && !farm_id`)

### App.vue

- When `authStore.isInFarmContext`: show a top banner "Viewing: [Farm Name] -- [Exit]"

## Step 7.8 -- i18n keys

Add `superAdmin` namespace to both `en.json` and `af.json`:

- `superAdmin.farms` / `superAdmin.farmList`
- `superAdmin.createFarm` / `superAdmin.farmDetail`
- `superAdmin.farmName` / `superAdmin.farmCode` / `superAdmin.farmSlug`
- `superAdmin.adminUsername` / `superAdmin.adminPassword` / `superAdmin.adminFullName`
- `superAdmin.enterFarm` / `superAdmin.exitFarm`
- `superAdmin.viewingFarm` (banner text)
- `superAdmin.revokeAllSessions` / `superAdmin.revokeAllConfirm`
- `superAdmin.farmCreated` / `superAdmin.farmUpdated`
- `superAdmin.deactivateFarm` / `superAdmin.deactivateConfirm`
- `superAdmin.noFarms` (empty state)
- Status labels: `superAdmin.active` / `superAdmin.inactive`

## Verification Checklist

1. **Farm CRUD**: Create farm -> verify all default data seeded (breed types, issue types, meds, flags, settings)
2. **Enter/Exit**: Enter farm -> dashboard shows farm data -> Exit -> back to super-admin context
3. **Permissions**: Farm admin cannot access `/super/*` routes
4. **Super-admin without farm**: Dashboard shows farm management cards, BottomNav hidden
5. **Deactivate farm**: Users can't log in, super-admin can still enter to view data
6. `npm test` -- all tests pass (add ~10 tests for farms route)
7. `cd client && npm run test:run` -- all tests pass (add tests for new views)
8. `npm run lint:fix` -- zero new errors
9. `npm run build` -- new views are lazy-loaded (check chunk output)
10. i18n keys in both locales
11. `npm run knip` -- no dead code

## Important Notes

- Super-admin views should be lazy-loaded (dynamic imports in router) to avoid bloating the main bundle
- The "Enter Farm" JWT should have a reasonable expiry (e.g., 4 hours) -- super-admin sessions in farm context shouldn't last forever
- Farm code auto-generation: strip non-alphanumeric, uppercase, max 10 chars. User can edit before submitting.
- The seed defaults should match what existing farms have -- extract from the actual seed file, don't hardcode separately
- Create farm is a transaction -- if any step fails (user creation, seeding), the entire farm creation rolls back
