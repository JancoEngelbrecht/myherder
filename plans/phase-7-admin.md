# Phase 7: Admin Settings + User Management — Implementation Plan

## Context

The app currently has two hardcoded seed users (admin + sipho). There's no way to create, edit, or deactivate users through the UI. The `users` table schema is complete (roles, permissions JSON, PIN, lockout, is_active), auth routes work, and admin route guards exist. This phase adds user CRUD, app-level settings, data export, and an audit trail.

## Design Decisions

- **User CRUD**: Admin-only. Follow the `issueTypes.js` route pattern. Workers get PIN auth, admins get password auth.
- **Permissions UI**: Checkbox array matching the existing JSON permissions model (`can_manage_cows`, `can_log_issues`, `can_log_treatments`, `can_log_breeding`, `can_record_milk`, `can_view_analytics`, `can_manage_users`, `can_manage_medications`)
- **App Settings**: Key-value `app_settings` table (farm_name, default_language). Displayed on login screen and AppHeader.
- **Data Export**: JSON dump of all tables via admin-only endpoint. Download button in SettingsView.
- **Audit Log**: Tracks entity changes (create/update/delete) with before/after snapshots. Lightweight middleware approach — helper function called explicitly in route handlers, not global middleware.
- **No offline sync for users/settings/audit**: These are admin-only, always-online operations. No IndexedDB tables needed.

## Quality Gate (run after EVERY sub-phase)

Every sub-phase ends with a mandatory quality gate before moving on. Do NOT skip any step.

1. **Tests**: Write tests for all new code (routes, views, stores). Run `cd client && npm run test:run` — all tests must pass.
2. **Lint**: Run `npm run lint:fix` — zero errors (warnings from pre-existing baseline are acceptable).
3. **Dead code scan**: Run `npm run knip` — no new unused exports, files, or dependencies.
4. **Self-review for refactor opportunities**:
   - Scan all new AND touched files for: duplicated logic that should be extracted, overly complex functions that should be split, inconsistent patterns vs the rest of the codebase, inefficient DB queries (N+1, missing indexes, redundant joins).
   - Check that new code follows conventions in MEMORY.md (section dividers, Joi schema placement, back buttons, etc.)
5. **Surprise check**: If anything unexpected is discovered during implementation (schema inconsistencies, broken existing code, missing data, security concerns, performance issues), **stop and notify the user** before proceeding. Do not silently work around surprises.
6. **i18n completeness**: Verify every new user-facing string has keys in BOTH `en.json` and `af.json`.

---

## SUB-PHASE 7.1: User Management API

### Step 7.1.1 — Create users API route
- **Create** `server/routes/users.js`
- Follow pattern from `server/routes/issueTypes.js` (section dividers, top-level Joi schemas)
- Mount in `server/app.js` at `/api/users` with `auth` + `authorize(['admin'])` middleware
- Endpoints:
  - `GET /` — list all users (exclude password_hash/pin_hash from response), supports `?active=0|1` filter
  - `GET /:id` — single user detail
  - `POST /` — create user; Joi validates: username (required, unique), full_name (required), role (admin|worker), language (en|af), permissions (array of strings), password (required if admin), pin (required if worker, 4-6 digits)
  - `PATCH /:id` — update user; all fields optional, re-hash password/pin if provided
  - `DELETE /:id` — soft deactivate (`is_active = false`), not hard delete. Block self-deactivation.
- Password/PIN hashing via `bcryptjs` (cost 12, matching existing auth.js pattern)
- **Helper**: `sanitizeUser(row)` — strips hash fields, parses permissions JSON, returns clean user object
- Validation: username uniqueness check on create/update, cannot change own role

### Step 7.1.2 — Mount route + verify
- Add to `server/app.js`: `app.use('/api/users', require('./routes/users'))`
- Verify with curl/node -e: GET returns 2 seed users, POST creates worker with PIN, PATCH updates permissions, DELETE deactivates

### Step 7.1.3 — Quality Gate
- Write route tests for users API (follow pattern from existing server tests if any, or add new test file)
- Run full Quality Gate checklist (see above)

---

## SUB-PHASE 7.2: User Management UI

### Step 7.2.1 — Create UserManagement view
- **Create** `client/src/views/admin/UserManagement.vue`
- Follow pattern from `BreedTypeManagement.vue` (list + add/edit form modal)
- **List section**: cards showing username, full_name, role badge, active/inactive badge, language badge, permission count
- **Add/Edit form**: username, full_name, role radio (admin/worker), language select (en/af), password field (admin) or PIN field (worker), permissions checkbox grid
- **Permission checkboxes**: group logically:
  - Logging: `can_log_issues`, `can_log_treatments`, `can_log_breeding`, `can_record_milk`
  - Viewing: `can_view_analytics`
  - Management: `can_manage_cows`, `can_manage_users`, `can_manage_medications`
- **Deactivate/Reactivate**: toggle button using ConfirmDialog
- Admin users auto-get all permissions (checkboxes disabled, all checked)

### Step 7.2.2 — Add route + navigation
- Add to `client/src/router/index.js`: `/admin/users` with `requiresAuth` + `requiresAdmin` guards
- Add to `SettingsView.vue`: User Management link in Admin Tools section (always visible to admin, not feature-flagged)
- i18n keys: `users.title`, `users.addUser`, `users.editUser`, `users.username`, `users.fullName`, `users.role`, `users.pin`, `users.password`, `users.permissions`, `users.active`, `users.inactive`, `users.deactivate`, `users.reactivate`, `users.confirmDeactivate`, `users.selfDeactivateBlocked` — in both en.json and af.json

### Verification
- Admin can list, create, edit, deactivate/reactivate users
- Workers with PIN can log in after creation
- Permission changes take effect on next login
- Cannot deactivate self

### Step 7.2.3 — Quality Gate
- Write component tests for UserManagement.vue (follow BreedTypeManagement test patterns if applicable)
- Run full Quality Gate checklist (see above)

---

## SUB-PHASE 7.3: App Settings

### Step 7.3.1 — Migration: create `app_settings` table
- **Create** `server/migrations/024_create_app_settings.js`
- Schema: `key` (string 50, PK), `value` (text), `updated_at` (timestamp)
- Seed default rows: `farm_name` = 'MyHerder Farm', `default_language` = 'en'

### Step 7.3.2 — App settings API route
- **Create** `server/routes/appSettings.js`
- `GET /api/settings` — returns all settings as `{ farm_name, default_language }` object (auth required, any user)
- `PATCH /api/settings` — admin only; body `{ key: value }` pairs; upserts each key; returns updated settings object
- Mount in `server/app.js`

### Step 7.3.3 — Frontend integration
- Add settings section to `SettingsView.vue`: Farm Name input + Default Language select (admin only, inline save)
- Display farm name in `AppHeader.vue` subtitle (optional — only if set and not on mobile)
- Display farm name on `LoginView.vue` above the login form
- i18n keys: `settings.farmName`, `settings.defaultLanguage`, `settings.farmNameDesc`, `settings.appSettings` — in both en.json and af.json

### Verification
- Admin can set farm name and default language
- Farm name shows on login screen
- Settings persist across sessions

### Step 7.3.4 — Quality Gate
- Write tests for appSettings route and any frontend integration
- Run full Quality Gate checklist (see above)

---

## SUB-PHASE 7.4: Data Export

### Step 7.4.1 — Export API endpoint
- Add to `server/routes/appSettings.js` (or new `server/routes/export.js`):
  - `GET /api/export` — admin only; queries all tables (users, cows, health_issues, treatments, medications, milk_records, breeding_events, breed_types, issue_types, app_settings, feature_flags), strips password/pin hashes; returns JSON with `{ exportedAt, tables: { users: [...], cows: [...], ... } }`
  - Set `Content-Disposition: attachment; filename="myherder-export-{date}.json"` header

### Step 7.4.2 — Frontend download button
- Add to `SettingsView.vue` Data section: "Export All Data" button
- On click: `api.get('/export', { responseType: 'blob' })` → trigger browser download
- i18n keys: `settings.exportData`, `settings.exportDataDesc` — in both en.json and af.json

### Verification
- Admin clicks export → JSON file downloads with all data
- No password/PIN hashes in export
- Workers cannot access export endpoint

### Step 7.4.3 — Quality Gate
- Write tests for export endpoint (verify hash stripping, admin-only access)
- Run full Quality Gate checklist (see above)

---

## SUB-PHASE 7.5: Audit Log

### Step 7.5.1 — Migration: create `audit_log` table
- **Create** `server/migrations/025_create_audit_log.js`
- Schema: `id` (string 36, PK), `user_id` (string 36, FK→users, nullable), `action` (string 50: 'create'|'update'|'delete'), `entity_type` (string 50: 'cow'|'user'|'treatment'|etc), `entity_id` (string 36), `old_values` (JSON text, nullable), `new_values` (JSON text, nullable), `created_at` (timestamp)
- Index on `entity_type` + `entity_id` and `created_at`

### Step 7.5.2 — Audit helper
- **Create** `server/services/auditService.js`
- Export: `logAudit({ userId, action, entityType, entityId, oldValues, newValues })` — inserts row into audit_log
- Call explicitly in route handlers for significant operations (user create/update/delete, cow create/update/delete, settings changes). NOT a global middleware — only for tracked entities.

### Step 7.5.3 — Wire audit calls into existing routes
- `server/routes/users.js`: log create, update, deactivate
- `server/routes/cows.js`: log create, update, soft-delete
- `server/routes/appSettings.js`: log setting changes
- Minimal: just these 3 routes initially. Can extend to other routes later.

### Step 7.5.4 — Audit log API + UI
- `GET /api/audit-log` — admin only; paginated; supports filters: `entity_type`, `entity_id`, `user_id`, `action`, `from`/`to` date range; returns `{ data: [...], total }`
- **Create** `client/src/views/admin/AuditLogView.vue` — scrollable list of audit entries with filter chips (by entity type), expandable rows showing old/new value diffs
- Route: `/admin/audit-log` with `requiresAdmin` guard
- Link in SettingsView Admin Tools section
- i18n keys: `audit.title`, `audit.action`, `audit.entityType`, `audit.user`, `audit.date`, `audit.oldValues`, `audit.newValues`, `audit.noEntries`, `audit.create`, `audit.update`, `audit.delete` — in both en.json and af.json

### Verification
- Creating/editing/deleting a user creates audit log entries
- Creating/editing/deleting a cow creates audit log entries
- Changing app settings creates audit log entries
- Admin can view and filter audit log
- Audit entries show who did what, when, with before/after values

### Step 7.5.5 — Quality Gate
- Write tests for auditService helper, audit log API endpoint, and AuditLogView component
- Run full Quality Gate checklist (see above)
- **Final Phase 7 sweep**: Review ALL files created/modified across the entire phase for cross-cutting concerns (consistent error handling, shared patterns, unnecessary duplication between sub-phases)
