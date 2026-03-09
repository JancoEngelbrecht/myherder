# Super-Admin Control Panel

> Parent: `PLAN.md` Phase 16
> Status: **PLANNING**

## Goal

Transform the super-admin experience from a bare "farm list" into a proper control panel for managing all farms. Purely additive — no breaking changes to existing farm/admin flows.

## Scope

### In scope
- **Global Defaults Management** — CRUD for default medications, issue types, breed types that seed new farms; ability to push new defaults to existing farms
- **Cross-Farm Export** — super-admin can export all farms' data (or selected farms) without entering each one
- **System Stats Dashboard** — aggregate stats across all farms on the super-admin home screen
- **Profile Cleanup** — super-admin profile shows correct role, no farm-specific settings link when outside farm context
- **System Announcements** — super-admin can broadcast messages (e.g. planned maintenance, new features) that appear as banners/toasts for all farm users

### Out of scope (future)
- Cross-farm audit log viewer
- Global feature flag overrides
- Billing / subscription management
- Import data into farms

---

## Design Decisions

### DD-1: Global defaults storage
**Decision needed:** Separate `global_default_*` tables vs a single `system_defaults` JSON table?

**Recommendation:** Three new tables mirroring the per-farm tables but without `farm_id`:
- `default_medications` — same columns as `medications` minus `farm_id`
- `default_issue_types` — same columns as `issue_type_definitions` minus `farm_id`
- `default_breed_types` — same columns as `breed_types` minus `farm_id`

**Rationale:** Typed columns enable validation. Matches existing admin CRUD patterns. `farmSeedService.js` reads from these tables instead of hardcoded arrays, with hardcoded fallback if tables are empty (safety net).

### DD-2: "Push to farms" behavior
**Decision needed:** When the super-admin adds a new default medication and pushes it to existing farms, what happens if a farm already has a medication with the same name?

**Recommendation:** Skip farms that already have a row with the same `code` (for issue/breed types) or `name` (for medications). Return a summary: `{ pushed: 5, skipped: 2, errors: 0 }`. This is additive-only — never overwrites farm customizations.

### DD-3: Cross-farm export format
**Decision needed:** Single JSON file with all farms, or ZIP with one file per farm?

**Recommendation:** Single JSON with `{ _meta, farms: { [farmId]: { name, code, tables: {...} } } }`. Simpler, and the file size for a handful of farms is manageable. The filename includes `all-farms` to distinguish from single-farm exports.

### DD-4: Announcement delivery mechanism
**Decision needed:** How do farm users see announcements? Options:
1. **Poll-based banner** — frontend polls `GET /api/announcements/active` on app load (or every N minutes). Active announcements render as a dismissible banner at the top of the page. Dismissed state stored in localStorage per announcement ID.
2. **WebSocket push** — real-time delivery via socket.io. More complex, requires new dependency + server infrastructure.
3. **Service worker push notification** — browser push notifications. Requires VAPID keys, notification permission, push subscription management.

**Recommendation:** Option 1 (poll-based banner). Simplest, no new dependencies, works offline (cached response), fits the existing architecture. The app already makes API calls on load — one more lightweight GET is negligible. Announcements are not time-critical (maintenance windows are planned hours/days ahead), so polling on app load is sufficient.

**Announcement model:**
- `type`: `info` | `warning` | `maintenance` — controls banner color/icon
- `title`: short headline (e.g. "Planned Maintenance")
- `message`: detail text (e.g. "The app will be offline on Saturday 10:00-12:00")
- `starts_at` / `expires_at`: visibility window (null expires_at = until manually deactivated)
- `is_active`: manual kill switch
- `target`: `all` | specific farm IDs (future: per-farm targeting)

---

## Phases

### Phase 1: Migration + Global Defaults Backend (L)
**Migration 033** — create three `default_*` tables, pre-populate from current `farmSeedService.js` hardcoded arrays.

| Task | Size | Files |
|------|------|-------|
| 1A. Create migration 033 with `default_medications`, `default_issue_types`, `default_breed_types` tables | M | `server/migrations/033_create_global_defaults.js` |
| 1B. Seed tables from existing hardcoded defaults in migration | S | (same file) |
| 1C. Update `farmSeedService.js` to read from DB tables, fallback to hardcoded | M | `server/services/farmSeedService.js` |
| 1D. Create `server/routes/globalDefaults.js` — CRUD for all three default types, `requireSuperAdmin` gated | L | `server/routes/globalDefaults.js`, `server/app.js` |
| 1E. Add "push to farms" endpoint: `POST /api/global-defaults/:type/push` | M | `server/routes/globalDefaults.js` |
| 1F. Backend tests | M | `server/tests/globalDefaults.test.js` |

**Acceptance criteria:**
- `GET/POST/PATCH/DELETE /api/global-defaults/medications` works (same for issue-types, breed-types)
- `POST /api/global-defaults/medications/push` inserts into all active farms that don't already have matching name/code
- `farmSeedService.js` reads from `default_*` tables; new farm gets DB-driven defaults
- All existing farm creation tests still pass

**API surface:**
```
GET    /api/global-defaults/medications         — list all default medications
POST   /api/global-defaults/medications         — create a default medication
PATCH  /api/global-defaults/medications/:id     — update
DELETE /api/global-defaults/medications/:id     — delete
POST   /api/global-defaults/medications/push    — push to all active farms

(same pattern for /issue-types and /breed-types)
```

---

### Phase 2: Global Defaults Frontend (L)

| Task | Size | Files |
|------|------|-------|
| 2A. Create `DefaultMedicationsView.vue` — list + add/edit/delete + push button | L | `client/src/views/super/DefaultMedicationsView.vue` |
| 2B. Create `DefaultIssueTypesView.vue` — same pattern | M | `client/src/views/super/DefaultIssueTypesView.vue` |
| 2C. Create `DefaultBreedTypesView.vue` — same pattern | M | `client/src/views/super/DefaultBreedTypesView.vue` |
| 2D. Add routes + navigation from dashboard | S | `client/src/router/index.js`, `client/src/views/DashboardView.vue` |
| 2E. i18n keys for both locales | S | `client/src/i18n/en.json`, `client/src/i18n/af.json` |
| 2F. Frontend tests | M | `client/src/tests/DefaultMedicationsView.test.js`, etc. |

**Acceptance criteria:**
- Super-admin dashboard shows "Default Medications", "Default Issue Types", "Default Breed Types" cards
- Each view allows full CRUD on global defaults
- "Push to All Farms" button shows confirmation dialog, then calls push endpoint, shows result summary
- Views only accessible when super-admin is NOT in farm context

---

### Phase 3: Cross-Farm Export (M)

| Task | Size | Files |
|------|------|-------|
| 3A. Add `GET /api/farms/export` — super-admin endpoint, exports all active farms' data | M | `server/routes/farms.js` |
| 3B. Add export button to super-admin dashboard or farm list | S | `client/src/views/DashboardView.vue` or `client/src/views/super/FarmListView.vue` |
| 3C. Backend test | S | `server/tests/farms.test.js` |

**Acceptance criteria:**
- `GET /api/farms/export` returns JSON with all farms' data (same tables as single-farm export)
- Response includes `_meta` with farm count and total records
- Users/passwords are sanitized (no hashes)
- Super-admin dashboard has a "Export All Farms" button that triggers download

**API surface:**
```
GET /api/farms/export  — super-admin only; returns all farms' data as JSON download
```

---

### Phase 4: System Stats Dashboard (M)

| Task | Size | Files |
|------|------|-------|
| 4A. Add `GET /api/farms/stats` — aggregate counts across all farms | S | `server/routes/farms.js` |
| 4B. Update DashboardView super-admin section with stat chips + action cards | M | `client/src/views/DashboardView.vue` |
| 4C. i18n keys | S | `client/src/i18n/en.json`, `client/src/i18n/af.json` |
| 4D. Backend test | S | `server/tests/farms.test.js` |

**Acceptance criteria:**
- `GET /api/farms/stats` returns `{ total_farms, active_farms, total_users, total_cows }`
- Super-admin dashboard shows stat chips (farms, users, cows) above action cards
- Dashboard action grid includes: Farms, Default Medications, Default Issue Types, Default Breed Types, Export All

**API surface:**
```
GET /api/farms/stats  — super-admin only; aggregate stats
```

---

### Phase 5: Profile Cleanup (S)

| Task | Size | Files |
|------|------|-------|
| 5A. ProfileView: hide "Settings" link when super-admin without farm context | S | `client/src/views/ProfileView.vue` |
| 5B. ProfileView: show "Super Admin" role badge distinct from "Admin" | S | `client/src/views/ProfileView.vue` |
| 5C. i18n keys for super-admin role label | S | `client/src/i18n/en.json`, `client/src/i18n/af.json` |

**Acceptance criteria:**
- Super-admin outside farm context: profile shows username, "Super Admin" badge, language, help, logout — NO settings link
- Super-admin inside farm context: profile shows settings link (for that farm), "Super Admin" badge
- Regular admin/worker: unchanged behavior

---

### Phase 6: System Announcements (M)

| Task | Size | Files |
|------|------|-------|
| 6A. Add `announcements` table to migration 033 (id, type, title, message, starts_at, expires_at, is_active, created_by, created_at, updated_at) | S | `server/migrations/033_create_global_defaults.js` |
| 6B. Create `server/routes/announcements.js` — CRUD (super-admin) + public active endpoint | M | `server/routes/announcements.js`, `server/app.js` |
| 6C. Create `AnnouncementsView.vue` — super-admin management (list, create, edit, deactivate) | M | `client/src/views/super/AnnouncementsView.vue` |
| 6D. Create `AnnouncementBanner.vue` molecule — dismissible banner, fetches active announcements on mount | M | `client/src/components/molecules/AnnouncementBanner.vue` |
| 6E. Mount banner in `App.vue` (above router-view, below farm context banner) | S | `client/src/App.vue` |
| 6F. i18n keys for both locales | S | `client/src/i18n/en.json`, `client/src/i18n/af.json` |
| 6G. Backend tests | S | `server/tests/announcements.test.js` |

**Acceptance criteria:**
- Super-admin can create announcements with type (info/warning/maintenance), title, message, optional start/expiry dates
- `GET /api/announcements/active` returns only currently active, non-expired announcements (public — no auth required, so it works even on login page)
- Farm users see a colored banner at the top of the app (blue=info, orange=warning, red=maintenance)
- Banner is dismissible — dismissed state stored in `localStorage` keyed by announcement ID
- Dismissed banners don't reappear until a new announcement is created
- Super-admin dashboard shows "Announcements" card in the action grid

**API surface:**
```
GET    /api/announcements          — super-admin only; all announcements (paginated)
POST   /api/announcements          — super-admin only; create
PATCH  /api/announcements/:id      — super-admin only; update
DELETE /api/announcements/:id      — super-admin only; soft delete (is_active=false)
GET    /api/announcements/active   — public; returns active, non-expired announcements
```

---

## Implementation Order

```
Phase 1 (backend) → Phase 2 (frontend) → Phases 3-6 (independent, any order)
```

Phases 3-6 are independent of each other and could be done in any order after Phase 1.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `farmSeedService` DB read fails (empty tables) | Low | High — new farms get no defaults | Hardcoded fallback array if DB query returns empty |
| Push-to-farms creates duplicates | Medium | Low — just extra rows | Match by `code` or `name` before inserting, skip existing |
| Cross-farm export too large | Low | Medium — timeout | Stream JSON response; add optional `?farm_ids=` filter param |
| Migration on production MySQL | Low | Low | Standard additive migration, no ALTER on existing tables |
| Announcement polling overhead | Low | Low — single lightweight GET | Only fetch on app load, cache in localStorage, short-circuit if dismissed |
