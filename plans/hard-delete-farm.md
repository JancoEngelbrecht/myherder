# Hard Delete Farm — Implementation Plan

## Problem

`DELETE /api/farms/:id` currently soft-deactivates (sets `is_active: false`), but the UI already does this via `PATCH /api/farms/:id` with `{ is_active: false }`. The delete action should permanently remove all farm data.

## Scope

- **Backend:** Change `DELETE /api/farms/:id` to hard-delete the farm and all tenant-scoped data
- **Frontend:** Add a separate "Delete Farm" button with typed-confirmation UX (custom inline dialog, not ConfirmDialog)
- **Frontend:** Change `deactivate()` from `api.delete()` to `api.patch()` — **must ship atomically with backend change**
- **Tests:** Add backend + frontend tests for the hard-delete flow; replace existing deactivate test
- **No breaking changes** to existing deactivate/reactivate flow or other tests

> **ATOMIC DEPLOYMENT:** The following files MUST be in a single git commit:
>
> - `server/routes/farms.js` (hard-delete endpoint)
> - `server/tests/farms.test.js` (replace deactivate test with hard-delete tests)
> - `client/src/views/super/FarmDetailView.vue` (deactivate() → api.patch, new delete button)
>
> Deploying the backend change without the frontend change causes the "Deactivate" button to permanently delete farm data.

## Tenant-Scoped Tables

Delete order matters due to FK constraints. Child tables first, then parent tables, then farm.

**Tables with `farm_id` column:** audit_log, sync_log (nullable), treatments, milk_records, breeding_events, health_issues, cows, medications, breed_types, issue_type_definitions, feature_flags, app_settings, users

**Tables WITHOUT `farm_id` (cleaned by user_id):** announcement_dismissals, health_issue_comments, sync_log (NULL farm_id rows)

**Special cases:**

- `cows` has self-referencing FKs (`sire_id`, `dam_id` → `cows.id`) — MySQL needs `SET FOREIGN_KEY_CHECKS=0`
- `health_issue_comments` has NO `farm_id` — must delete by `health_issue_id` (from farm's health issues)
- `sync_log.farm_id` is nullable (migration 032) — also clean by `user_id` to catch NULL rows
- `announcement_dismissals` must be deleted before `users` (MySQL FK: `user_id` → `users.id`)

## Phase 1: Backend — Hard Delete Endpoint

### 1A. Update `DELETE /api/farms/:id` in `server/routes/farms.js`

Replace the soft-deactivate logic with:

```js
// DELETE /api/farms/:id — permanently delete farm and all data
router.delete('/:id', async (req, res, next) => {
  try {
    const farm = await db('farms').where('id', req.params.id).first()
    if (!farm) return res.status(404).json({ error: 'Farm not found' })

    // Note: requireSuperAdmin middleware already prevents farm-scoped tokens
    // from reaching this handler (403 "Exit farm context before accessing super admin panel").

    // Guard: refuse to delete if super-admin users are assigned to this farm
    const superAdminCount = await db('users')
      .where({ farm_id: farm.id, role: 'super_admin' })
      .count('* as c')
      .first()
    if (Number(superAdminCount.c) > 0) {
      return res
        .status(409)
        .json({ error: 'Cannot delete farm with super-admin users. Reassign them first.' })
    }

    // Get farm user IDs (for tables without farm_id: announcement_dismissals, health_issue_comments)
    const farmUserIds = await db('users').where('farm_id', farm.id).pluck('id')
    // Get farm health issue IDs (health_issue_comments has no farm_id column)
    const farmIssueIds = await db('health_issues').where('farm_id', farm.id).pluck('id')

    const isSQLite = !['mysql', 'mysql2'].includes(db.client.config.client)

    await db.transaction(async (trx) => {
      // MySQL: disable FK checks for self-referencing cows table (sire_id, dam_id)
      if (!isSQLite) {
        await trx.raw('SET FOREIGN_KEY_CHECKS=0')
      }

      // Delete in FK-safe order
      await trx('audit_log').where('farm_id', farm.id).del()
      // sync_log.farm_id is nullable (migration 032) — delete by farm_id AND user_id to catch NULL rows
      await trx('sync_log').where('farm_id', farm.id).del()
      if (farmUserIds.length > 0) {
        await trx('sync_log').whereIn('user_id', farmUserIds).del()
        // announcement_dismissals must come before users (MySQL FK: user_id → users.id)
        await trx('announcement_dismissals').whereIn('user_id', farmUserIds).del()
      }
      // health_issue_comments has NO farm_id — delete by health_issue_id
      if (farmIssueIds.length > 0) {
        await trx('health_issue_comments').whereIn('health_issue_id', farmIssueIds).del()
      }
      await trx('treatments').where('farm_id', farm.id).del()
      await trx('milk_records').where('farm_id', farm.id).del()
      await trx('breeding_events').where('farm_id', farm.id).del()
      await trx('health_issues').where('farm_id', farm.id).del()
      await trx('cows').where('farm_id', farm.id).del()
      await trx('medications').where('farm_id', farm.id).del()
      await trx('breed_types').where('farm_id', farm.id).del()
      await trx('issue_type_definitions').where('farm_id', farm.id).del()
      await trx('feature_flags').where('farm_id', farm.id).del()
      await trx('app_settings').where('farm_id', farm.id).del()
      // Exclude super_admin users (guard above ensures none, but defense-in-depth)
      await trx('users').where('farm_id', farm.id).whereNot('role', 'super_admin').del()
      await trx('farms').where('id', farm.id).del()

      if (!isSQLite) {
        await trx.raw('SET FOREIGN_KEY_CHECKS=1')
      }
    })

    // No audit_log entry — the farm and its log are gone
    res.json({ message: 'Farm permanently deleted' })
  } catch (err) {
    next(err)
  }
})
```

### 1B. Safety summary

- **Auth:** `requireSuperAdmin` middleware blocks farm-scoped tokens (403) — no additional "inside farm" check needed
- **Super-admin guard:** Refuses deletion if super-admin users assigned to farm (409), checked before transaction
- **MySQL FKs:** `SET FOREIGN_KEY_CHECKS=0` handles self-referencing `cows.sire_id`/`dam_id`
- **Transaction:** All-or-nothing — failure rolls back everything
- **health_issue_comments:** Deleted by `health_issue_id` (no `farm_id` column on this table)
- **sync_log orphans:** Cleaned by both `farm_id` and `user_id` to catch nullable `farm_id` rows

### 1C. Concurrent session cleanup

Super-admins currently inside the deleted farm (via a 4-hour farm-scoped JWT in another tab/browser) will get a 401 on their next API call — their user row is deleted, so the auth middleware's `token_version` DB check finds no user. The client 401 interceptor calls `logout()` and clears localStorage. No additional client-side handling is needed.

## Phase 2: Frontend — Delete Farm Button + Confirmation

### 2A. Add "Delete Farm" button in `FarmDetailView.vue`

Add a new danger button (always visible, independent of `is_active` state):

```html
<button class="btn-danger btn-sm-pill" @click="showDeleteFarm = true">
  {{ t('superAdmin.deleteFarm') }}
</button>
```

### 2B. Build typed-confirmation dialog inline in `FarmDetailView.vue`

`ConfirmDialog` does not support input fields or conditional confirm-button disabling. Build a one-off dialog inline using the same visual style. Copy the CSS from `ConfirmDialog.vue:47-84` into `FarmDetailView.vue`'s scoped styles:

```html
<Transition name="fade">
  <div v-if="showDeleteFarm" class="dialog-overlay" @click.self="cancelDelete">
    <div class="dialog">
      <p class="dialog-text">{{ t('superAdmin.deleteConfirmMessage', { name: farm.name }) }}</p>
      <div class="form-group">
        <label>{{ t('superAdmin.typeToConfirm', { name: farm.name }) }}</label>
        <input v-model="deleteConfirmInput" class="form-input" :placeholder="farm.name" />
      </div>
      <div class="dialog-actions">
        <button
          class="btn-danger"
          :disabled="deleting || deleteConfirmInput !== farm.name"
          @click="hardDeleteFarm"
        >
          {{ t('superAdmin.deleteFarmConfirm') }}
        </button>
        <button class="btn-secondary" :disabled="deleting" @click="cancelDelete">
          {{ t('common.cancel') }}
        </button>
      </div>
    </div>
  </div>
</Transition>
```

CSS to add to `FarmDetailView.vue` scoped styles (copied from ConfirmDialog.vue):

```css
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 24px;
}
.dialog {
  background: var(--surface);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 360px;
  box-shadow: var(--shadow-lg);
}
.dialog-text {
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  margin-bottom: 20px;
}
.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
```

### 2C. Add `hardDeleteFarm()` function + refs

```js
const showDeleteFarm = ref(false)
const deleteConfirmInput = ref('')
const deleting = ref(false)

function cancelDelete() {
  showDeleteFarm.value = false
  deleteConfirmInput.value = ''
}

async function hardDeleteFarm() {
  deleting.value = true
  try {
    await api.delete(`/farms/${farm.value.id}`)
    showToast(t('superAdmin.farmDeleted'), 'success')
    router.push('/super/farms')
  } catch (err) {
    showToast(err.response?.data?.error || t('common.error'), 'error')
  } finally {
    deleting.value = false
  }
}
```

### 2D. Update existing `deactivate()` function (ATOMIC with Phase 1A)

Change `deactivate()` at line 222 from `api.delete()` to `api.patch()`. Also improves `farm.value` update to use server response instead of local mutation:

```js
async function deactivate() {
  deactivating.value = true
  try {
    const { data } = await api.patch(`/farms/${farm.value.id}`, { is_active: false })
    farm.value = { ...farm.value, ...data }
    showDeactivate.value = false
    showToast(t('superAdmin.farmDeactivated'), 'success')
  } catch {
    showToast(t('common.error'), 'error')
  } finally {
    deactivating.value = false
  }
}
```

## Phase 3: i18n Keys

Add to both `en.json` and `af.json` under `superAdmin` namespace:

**English:**

```json
"deleteFarm": "Delete Farm",
"deleteFarmConfirm": "Delete Permanently",
"deleteConfirmMessage": "This will PERMANENTLY delete farm \"{name}\" and ALL its data (cows, milk records, treatments, health issues, breeding events, users, etc). This cannot be undone.",
"typeToConfirm": "Type \"{name}\" to confirm:",
"farmDeleted": "Farm permanently deleted"
```

**Afrikaans:**

```json
"deleteFarm": "Verwyder Plaas",
"deleteFarmConfirm": "Verwyder Permanent",
"deleteConfirmMessage": "Dit sal plaas \"{name}\" en AL sy data (koeie, melkrekords, behandelings, gesondheidskwessies, teelgebeurtenisse, gebruikers, ens.) PERMANENT verwyder. Dit kan nie ongedaan gemaak word nie.",
"typeToConfirm": "Tik \"{name}\" om te bevestig:",
"farmDeleted": "Plaas permanent verwyder"
```

## Phase 4: Tests

### 4A. Backend tests in `server/tests/farms.test.js`

**Replace** the existing "deactivates farm" test with hard-delete tests. All in same commit as Phase 1A.

1. `DELETE /api/farms/:id` — hard deletes farm and all associated data
   - Seed a second farm with: user, cow, treatment, milk_record, health_issue, health_issue_comment, breeding_event, medication, breed_type, issue_type, feature_flag, app_setting
   - After delete: verify zero rows for that farm_id across all tables
   - Verify the farm row itself is gone
2. `DELETE /api/farms/:id` — returns 404 for non-existent farm
3. `DELETE /api/farms/:id` — returns 403 for admin token and worker token
4. `DELETE /api/farms/:id` — returns 409 if super-admin user is assigned to the farm
   - Insert `{ farm_id: targetFarmId, role: 'super_admin', ... }` via `db('users').insert(...)` to simulate
5. `DELETE /api/farms/:id` — cross-tenant safety: seed two farms, delete one, verify other farm's data is untouched
6. `PATCH /api/farms/:id { is_active: false }` — deactivates farm (replaces old DELETE deactivation test)

### 4B. Create `client/src/tests/FarmDetailView.test.js`

New file. Pattern from `FarmListView.test.js` / `CreateFarmView.test.js`.

1. Delete button renders
2. Clicking delete shows typed-confirmation dialog
3. Confirm button disabled until farm name typed correctly
4. Confirming deletion calls `api.delete()` and redirects to `/super/farms`
5. API error shows toast
6. Deactivate button calls `api.patch()` with `{ is_active: false }`

## Phase 5: Documentation Updates

- **CLAUDE.md:** Update `DELETE /api/farms/:id` from "soft deactivate" to "hard delete — permanently removes farm and all tenant-scoped data (transaction, super-admin only). Returns 409 if super-admin users assigned to farm."
- **CLAUDE.md:** Add note: "Deactivation is done via `PATCH /api/farms/:id` with `{ is_active: true/false }`"
- **MEMORY.md:** Update test counts after all tests pass
