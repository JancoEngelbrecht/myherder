# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs Express + Vite concurrently)
npm run dev

# Run backend or frontend individually
npm run dev:server    # nodemon server/index.js (port 3000)
npm run dev:client    # vite dev server (port 5173)

# Database
npm run migrate       # knex migrate:latest
npm run seed          # knex seed:run (admin/admin123, sipho/PIN 1234)

# Build frontend for production
npm run build         # outputs client/dist/
```

```bash
# Tests
cd client && npm run test:run          # Frontend (Vitest, 645+ tests)
npm test                                # Backend (Jest, 575+ tests)
npm test -- --testPathPattern=cows      # Single backend test file
cd client && npx vitest run src/tests/CowCard.test.js  # Single frontend test

# Lint & format
npm run lint / npm run lint:fix        # ESLint 9 flat config
npm run format                         # Prettier
npm run format:check                   # Prettier check (CI)
npm run knip                           # Dead code detection
```

## Architecture

**Backend:** Express on port 3000 serving REST API at `/api/*`. In production, also serves the Vue SPA from `client/dist/` with a catch-all route.

**Frontend:** Vue 3 (Composition API) + Pinia stores + vue-router + vue-i18n v11. Vite dev server on port 5173 proxies `/api` requests to localhost:3000.

**Database:** Knex with better-sqlite3 in dev (`./dev.sqlite3`), MySQL2 in production. Config in `knexfile.js`; singleton instance exported from `server/config/database.js`.

**Offline/PWA:** `vite-plugin-pwa` with NetworkFirst strategy for `/api` routes (10s timeout). Dexie.js IndexedDB (`myherder_db`) stores `cows` and `auth` tables. The cows Pinia store falls back to IndexedDB when API calls fail.

**Multi-Tenancy:** All tenant-scoped tables have `farm_id NOT NULL`. The `tenantScope` middleware (applied to all `/api/*` except auth/settings/announcements) extracts `farm_id` from JWT and sets `req.farmId`. Three roles: `super_admin` (cross-farm, no farm*id), `admin` (farm-scoped), `worker` (farm-scoped). Super-admin can "enter" a farm via `POST /api/farms/:id/enter` (4h scoped JWT). Frontend stores original token and restores on exit. IndexedDB is farm-scoped (`myherder_db*<farmId>`).

**Auth:** Two login modes — admin password (`POST /api/auth/login`, 24h JWT) and worker PIN (`POST /api/auth/login-pin`, 7d JWT, PIN is exactly 4 digits). Login accepts optional `farm_code`; PIN login requires it. Optional TOTP 2FA (setup-2fa, confirm-2fa, verify-2fa endpoints). `POST /api/auth/refresh` renews a valid JWT (auto-called when <1h from expiry). Offline login falls back to cached JWT in IndexedDB if not expired. JWT payload includes `{ id, username, full_name, role, permissions[], language, farm_id }`. Admin role bypasses permission checks; workers need specific permissions (e.g., `can_manage_cows`). Token versioning: auth middleware checks `token_version` per request to support session revocation. Token stored in both localStorage and IndexedDB.

**Permission Enforcement:** The `authorize(permission)` middleware in `server/middleware/authorize.js` gates write routes by permission. Admin role auto-bypasses. Route → permission mapping:
| Permission | Routes gated |
|---|---|
| `can_record_milk` | POST/PUT/DELETE `/api/milk-records` |
| `can_log_issues` | POST `/api/health-issues`, PATCH status, POST comments |
| `can_log_treatments` | POST/DELETE `/api/treatments` |
| `can_log_breeding` | POST `/api/breeding-events`, PATCH dismiss/dismiss-batch |
| `can_view_analytics` | All `/api/analytics/*` (router.use level) |

Frontend: `authStore.hasPermission(perm)` checks permission (admin always true). Routes use `meta.requiresPermission`. BottomNav and DashboardView hide items when worker lacks permission.

## API Conventions

- All routes except `/api/auth/*` require `Authorization: Bearer <token>`
- **Read-mirrors-write model:** GET routes require the same permission as their corresponding write routes. Workers only see data for features they have permission to use. Sync pull (`/api/sync/pull`) also filters entities by permission — unpermitted entity keys are omitted entirely.
- `GET /api/cows` returns a **plain array**, not `{ cows: [] }`
- `GET /api/cows/:id` returns cow with `sire_name`/`dam_name` strings + `breed_type_name`/`breed_type_code` via left-joins
- Cow date field is `dob`, not `date_of_birth`
- `GET /api/analytics/herd-summary` returns `{ total, by_status: [{status, count}], milking_count, dry_count, heifer_count, males, females, replacement_rate }`
- `GET /api/analytics/unhealthiest?from&to` — top 10 cows by issue count; returns `[{ id, tag_number, name, sex, issue_count }]`
- `GET /api/analytics/milk-trends?from&to` — monthly milk totals (default last 12 months); returns `{ months: [{ month, total_litres, record_count, avg_per_cow }] }`
- `GET /api/analytics/top-producers?from&to` — top 10 cows by avg daily litres (min 3 recording days); returns `[{ id, tag_number, name, total_litres, days_recorded, avg_daily_litres }]`
- `GET /api/analytics/wasted-milk?from&to` — monthly discarded milk; returns `{ months: [{ month, discarded_litres, discard_count }], total_discarded }`
- `GET /api/analytics/breeding-overview?from&to` — returns `{ pregnant_count, not_pregnant_count, repro_status: { pregnant, not_pregnant, bred_awaiting_check, dry, heifer_not_bred }, abortion_count, pregnancy_rate, calvings_by_month: [{ month, count }], avg_services_per_conception }`
- `GET /api/analytics/breeding-activity?from&to` — monthly inseminations vs conceptions; returns `{ months: [{ month, inseminations, conceptions }] }`
- `GET /api/analytics/treatment-costs?from&to` — monthly treatment spend; returns `{ months: [{ month, total_cost, treatment_count }], grand_total }`
- `GET /api/analytics/seasonal-prediction` — top 3 predicted issue types for next 2 months; returns `{ predictions: [{ month, month_name, issues: [{ type, code, emoji, historical_avg }] }], years_of_data }`
- `GET /api/analytics/daily-kpis` — today's snapshot: `{ litres_today, litres_7day_avg, cows_milked_today, cows_expected, active_health_issues, breeding_actions_due }`
- `GET /api/analytics/litres-per-cow?from&to` — monthly avg litres per cow per day; returns `{ months: [{ month, avg_litres_per_cow_per_day, cow_count }] }`
- `GET /api/analytics/bottom-producers?from&to` — bottom 10 cows by avg daily litres (min 3 recording days); returns `[{ id, tag_number, name, total_litres, days_recorded, avg_daily_litres }]`
- `GET /api/analytics/calving-interval?from&to` — avg days between successive calvings per cow; returns `{ avg_calving_interval_days, cow_count, intervals: [{ cow_id, tag_number, name, interval_days, calving_count }] }`
- `GET /api/analytics/days-open?from&to` — avg days from calving to next confirmed pregnancy; returns `{ avg_days_open, cow_count, records: [{ cow_id, tag_number, name, days_open }] }`
- `GET /api/analytics/conception-rate?from&to` — first-service conception rate; returns `{ first_service_rate, total_first_services, first_service_conceptions, by_month: [{ month, rate, total, conceptions }] }`
- `GET /api/analytics/issue-frequency?from&to` — issue count by type + trend by month; returns `{ by_type: [{ code, name, emoji, count }], by_month: [{ month, counts: { code: count } }] }`
- `GET /api/analytics/mastitis-rate?from&to` — mastitis cases per 100 cows per month; returns `{ months: [{ month, rate, cases, herd_size }], avg_rate }`
- `GET /api/analytics/withdrawal-days?from&to` — milk withdrawal days lost per month; returns `{ months: [{ month, total_withdrawal_days, cows_affected }], grand_total_days }`
- `GET /api/analytics/age-distribution` — count by age bracket + sex split; returns `{ brackets: [{ label, count, males, females }], total, males, females }`
- `GET /api/analytics/breed-composition` — count by breed type; returns `{ breeds: [{ name, code, count }], total }`
- `GET /api/analytics/mortality-rate?from&to` — sold + dead as % of herd per month; returns `{ months: [{ month, sold, dead, rate_pct }], total_lost, avg_rate_pct }`
- `GET /api/analytics/herd-turnover?from&to` — monthly additions vs removals; returns `{ months: [{ month, additions, removals, net }], total_additions, total_removals }`
- `GET /api/analytics/herd-size-trend?from&to` — cumulative herd size over time; returns `{ months: [{ month, total }] }`
- `GET /api/analytics/health-resolution-stats?from&to` — combined health stat chips; returns `{ total_issues, resolved_count, cure_rate, avg_days_to_resolve, recurrence_rate, top_incidence: [{ code, name, emoji, rate }] }`
- `GET /api/analytics/health-resolution-by-type?from&to` — avg resolution days per issue type; returns `{ by_type: [{ code, name, emoji, avg_days, count }] }`
- `GET /api/analytics/health-recurrence?from&to` — per-type recurrence rate (60-day window); returns `{ by_type: [{ code, name, emoji, rate, resolved, recurred }] }`
- `GET /api/analytics/health-cure-rate-trend?from&to` — monthly cure rate; returns `{ months: [{ month, rate, total, resolved }] }`
- `GET /api/analytics/slowest-to-resolve?from&to` — top 10 cows by avg resolution time; returns `[{ id, tag_number, name, avg_days, issue_count }]`
- Cows API supports `search`, `status`, `sex`, `breed_type_id`, `is_dry`, `page`, `limit` query params
- Soft delete: `DELETE /api/cows/:id` sets `deleted_at` (admin only)
- **Cow IDs are UUIDs** — never use `Number(route.params.id)`
- `GET /api/medications` — active only; `?all=1` for all (admin)
- `GET /api/milk-records` — **dual mode**: without `page`/`limit` returns plain array (legacy recording page); with `page`/`limit` returns `{ data: [...], total: N }` (history view). Optional filters: `date`, `from`/`to` (date range), `session`, `cow_id`, `recorded_by`, `search` (LIKE on tag_number/cow_name/recorded_by_name), `discarded` (boolean). Sort: `sort=recording_date|litres|tag_number`, `order=asc|desc` (default: recording_date desc). Joined fields: `tag_number`, `cow_name`, `recorded_by_name`
- `GET /api/milk-records/recorders` — distinct users who recorded milk on the farm; returns `[{ id, full_name }]`
- `GET /api/milk-records/summary?date=YYYY-MM-DD` — session totals for a date
- `GET /api/milk-records/:id` — single record with joins
- `POST /api/milk-records` — create; auto-flags withdrawal; unique per cow/session/date (409 on duplicate)
- `PUT /api/milk-records/:id` — update litres/discard; owner or admin only
- `DELETE /api/milk-records/:id` — admin only
- `GET /api/treatments?cow_id=X` — with medication/user names joined; `GET /api/treatments/withdrawal` — latest per cow on withdrawal; POST auto-calculates `withdrawal_end_milk`/`withdrawal_end_meat`
- `GET/POST /api/health-issues`, `PATCH /api/health-issues/:id/status`, `DELETE /api/health-issues/:id`
- `affected_teats` stored as JSON string in SQLite — always `JSON.parse()` when reading
- `GET /api/issue-types` — active only; `?all=1` for all; CRUD admin-only; DELETE blocked if `code` referenced in `health_issues`; `code` is immutable slug auto-generated from `name`
- `GET /api/breed-types` — active only; `?all=1` for all; CRUD admin-only; DELETE blocked if cows reference breed; `code` is immutable slug auto-generated from `name`
- `GET /api/breeding-events?page=N&limit=N&event_type=X` — paginated; returns `{ data: [...], total: N }` (event_type accepts comma-separated values e.g. `ai_insemination,bull_service`)
- `GET /api/breeding-events?cow_id=X` — plain array (no pagination; used by per-cow repro views)
- `POST /api/breeding-events`, `PATCH /:id` (admin), `PATCH /:id/dismiss` (any user), `DELETE /:id` (admin)
- `GET /api/breeding-events/upcoming` returns `{ heats, calvings, pregChecks, dryOffs, needsAttention }` — excludes dismissed events
- Breeding auto-dates use breed-specific timings from `breed_types` table (gestation, heat cycle, preg check, dry-off days)
- `GET /api/feature-flags` — returns all flags as `{ breeding, milkRecording, healthIssues, treatments, analytics }` (camelCase); DB stores snake_case keys
- `PATCH /api/feature-flags` — admin only; body `{ flagKey: bool }` (camelCase); returns updated full flags object
- `GET /api/sync/health` — no auth, returns `{ ok, timestamp }` (connectivity check)
- `POST /api/sync/push` — batch push client changes; body `{ deviceId, changes: [{ entityType, action, id, data, updatedAt }] }`; returns `{ results: [{ id, entityType, status, serverData?, error? }] }`; LWW conflict resolution
- `GET /api/sync/pull?since=<ISO>&full=1` — pull server data; returns `{ cows, medications, treatments, healthIssues, milkRecords, breedingEvents, breedTypes, issueTypes, deleted, syncedAt }`
- `GET /api/users` — admin only; returns all users (sanitized, no hashes). `?active_only=1` for active users only
- `POST /api/users` — admin only; create user with `{ username, full_name, role, pin?, password?, permissions[], language }`
- `PATCH /api/users/:id` — admin only; update user fields. Cannot change own role
- `DELETE /api/users/:id` — admin only; soft-deactivates (sets `is_active: false`). Cannot deactivate self
- `GET /api/settings` — **public** (no auth); returns key-value object `{ farm_name, default_language }`
- `PATCH /api/settings` — admin only; upserts settings `{ farm_name?, default_language? }`
- `GET /api/export` — admin only; JSON dump of all tables (hashes stripped)
- `GET /api/reports/*` — admin only; all endpoints require `from` (YYYY-MM-DD), `to` (YYYY-MM-DD), optional `format` (pdf|xlsx, default pdf). Returns binary file with Content-Disposition attachment header.
  - `GET /api/reports/treatment-history` — all treatments with medications, costs, vet visits, linked health issues
  - `GET /api/reports/discarded-milk` — all discarded milk records with reasons
  - `GET /api/reports/medication-usage` — grouped by medication: usage count, total cost, % of treatments
  - `GET /api/reports/milk-production` — per-cow production summary with session averages
  - `GET /api/reports/breeding` — all breeding events with type breakdown
  - `GET /api/reports/herd-health` — health issues with severity, resolution time, linked treatment count
- `GET /api/audit-log` — admin only; paginated `{ data: [...], total }`. Filters: `entity_type`, `entity_id`, `user_id`, `action`, `from`, `to`
- `GET /api/farms` — super-admin only; returns farms array with `user_count`, `cow_count` stats. `?active=0|1` filter
- `GET /api/farms/:id` — super-admin only; farm detail with `users` array (sanitized)
- `POST /api/farms` — super-admin only; atomic create: farm + admin user + seed defaults (breed types, issue types, medications, feature flags, settings). Body: `{ name, code, admin_username, admin_password, admin_full_name }`. Code: uppercase alphanumeric 3-10 chars
- `PATCH /api/farms/:id` — super-admin only; update `{ name?, code?, is_active? }`. Use `{ is_active: false/true }` for deactivation/reactivation
- `DELETE /api/farms/:id` — super-admin only; **hard delete** — permanently removes farm and all tenant-scoped data in a transaction. Returns 409 if super-admin users are assigned to the farm
- `POST /api/farms/:id/enter` — super-admin only; issues 4h farm-scoped JWT for cross-farm management
- `POST /api/farms/:id/revoke-all-sessions` — super-admin only; bumps `token_version` for all farm users
- `POST /api/users/:id/revoke-sessions` — admin only; bumps individual user's `token_version`
- `GET /api/global-defaults/:type` — super-admin only; list defaults (`?all=1` for inactive too). Types: `breed-types`, `issue-types`, `medications`
- `POST /api/global-defaults/:type` — super-admin only; create default
- `PATCH /api/global-defaults/:type/:id` — super-admin only; update default
- `DELETE /api/global-defaults/:type/:id` — super-admin only; soft deactivate. With `?hard=1` and item already inactive: permanent hard delete
- `POST /api/global-defaults/:type/push` — super-admin only; push defaults to farms. Body: `{ farm_ids: 'all' | [...] }`. Returns `{ pushed, skipped, farms_affected }`
- `GET /api/farms/export` — super-admin only; cross-farm JSON dump (sensitive fields stripped)
- `GET /api/farms/stats` — super-admin only; aggregate counts `{ total_farms, active_farms, total_users, active_users, total_cows, active_cows }`
- `GET /api/announcements/active` — public (no auth); active non-expired announcements
- `GET /api/announcements` — super-admin only; all announcements
- `POST /api/announcements` — super-admin only; create. Body: `{ type: info|warning|maintenance, title, message?, starts_at?, expires_at? }`
- `PATCH /api/announcements/:id` — super-admin only; update
- `DELETE /api/announcements/:id` — super-admin only; soft deactivate
- `POST /api/announcements/:id/dismiss` — authenticated; dismiss for current user (idempotent)
- `GET /api/system/health` — super-admin only; operational metrics snapshot. Returns `{ node_version, uptime_seconds, memory: { rss_mb, heap_used_mb, heap_total_mb }, disk: { total_gb, used_gb, available_gb, used_pct } | null, database: { size_mb, tables: [{ name, rows, size_mb }] } | null, requests: { started_at, total, errors_4xx, errors_5xx, error_rate_5xx_pct, avg_response_ms, p95_response_ms, window_size }, recent_errors: [{ timestamp, method, path, status, message }], thresholds: { memory_status, disk_status, response_status, error_status } }`. Threshold values: `green` / `yellow` / `red` / `unknown`. Recent errors: last 20 5xx errors (in-memory, newest first, resets on restart)

## i18n

Two locales: `en.json` and `af.json` in `client/src/i18n/`. Locale persisted to `localStorage('locale')`. All user-facing strings must have entries in both files. Keys are namespaced: `nav`, `login`, `dashboard`, `cows`, `cowForm`, `cowDetail`, `status`, `sex`, `analytics`, `common`, `sync`, `placeholder`, `featureFlags`, `users`, `settings`, `audit`, `profile`, `superAdmin`, `systemHealth`.

## Frontend Component Architecture (Atomic Design)

All frontend components live under `client/src/components/` in atomic tiers:

| Tier          | Path                    | Contents                                           |
| ------------- | ----------------------- | -------------------------------------------------- |
| **atoms**     | `components/atoms/`     | SyncIndicator — purely visual, no children         |
| **molecules** | `components/molecules/` | TeatSelector, CowSearchDropdown, **ConfirmDialog** |
| **organisms** | `components/organisms/` | AppHeader, BottomNav, CowCard                      |
| **views**     | `src/views/`            | Full pages — never import from `components/` root  |

**Rules:**

- Always import from the correct tier path (e.g. `../components/organisms/AppHeader.vue`)
- Never place components in the flat `components/` root — always use a tier subfolder
- New components must be assigned to the lowest fitting tier
- **Every delete action** must use `ConfirmDialog` (`molecules/ConfirmDialog.vue`) — never inline a delete dialog
  - Props: `:show`, `:message`, `:confirm-label`, `:cancel-label`, `:loading`; emits `@confirm`, `@cancel`
- Display issue types via `issueTypesStore.getByCode(code)?.name|emoji` — never i18n keys
- Milk withdrawal badge: always guard with `if (cow.value?.sex === 'male') return false`

**Action buttons in detail views:**

- Use `.actions-section` flex container + `.action-btn` class
- Mobile: `flex: 1 1 100%` (stacked, full width)
- Desktop ≥600px: `flex: 0 1 auto; width: auto` (side by side, auto width)

## Design System

CSS custom properties defined in `client/src/style.css`:

- Colors: primary `#2D6A4F`, danger `#D62828`, warning `#E07C24`, bg `#F4F1EC`, surface `#FFFFFF`, border `#E5E0D8`
- Fonts: DM Sans (body), JetBrains Mono (numbers/tags/badges)
- Border radius: 12px default, 8px small, 16px large
- Global utility classes: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.card`, `.badge`, `.badge-{status}`, `.form-group`, `.form-input`, `.page`, `.fab`, `.spinner`, `.empty-state`, `.mono`
- Note: `.btn-*` classes all have `width: 100%` by default — override with `.btn-sm-pill` or scoped `width: auto`
- **Filter chips:** `.filter-chips` (scrollable row) + `.chip` + `.chip-count` are global. Direct children of `.page-content` get full-bleed scroll (negative margins extend to viewport edges). Use `.filter-chips-wrap` for wrapping (non-scrolling) chip rows inside panels.

## Project Phases

Master plan in `PLAN.md`. Feature sub-plans in `plans/` folder. See `MEMORY.md` for current phase status — always check before starting work.

### Sub-Plan Workflow

When the user says "make this a feature sub-plan" (or similar):

1. Create `plans/<feature-name>.md` with detailed implementation steps
2. Add a `> Sub-plan: [plans/<feature-name>.md](plans/<feature-name>.md)` link under the relevant phase in `PLAN.md`
3. Track sub-phase progress in `MEMORY.md` as work proceeds
4. When complete, mark the sub-plan link in `PLAN.md` with `(COMPLETE)`

Sub-plans live in `plans/` — check `MEMORY.md` for full list and completion status.

## Environment

Copy `.env.example` to `.env`. Key vars: `JWT_SECRET` (required in production), `DB_PATH` (SQLite file, default `./dev.sqlite3`), `PORT` (default 3000). Production uses `DB_HOST/PORT/USER/PASSWORD/NAME` for MySQL.

## Agent Efficiency Guidelines

These rules help keep token usage low while maintaining quality output:

**Before writing code:**

- Read `MEMORY.md` first — it has phase status, file map, and conventions that prevent redundant exploration
- Use targeted `Glob`/`Grep` with specific patterns — don't broad-search
- When the plan says "follow pattern from X file", read X once and replicate — don't explore alternatives
- Check if a reference file is listed in MEMORY.md before searching for it

**While writing code:**

- Follow conventions in MEMORY.md `Code Conventions` section — write clean code the first time
- Batch related edits to the same file into one Edit call where possible
- Don't read files you've already read in the same conversation unless they were modified
- For new route files: copy structure from closest existing route (see `Pattern Reference Files` in MEMORY.md)

**After writing code:**

- Self-review: check for redundant DB queries, duplicated patterns, top-level schema placement
- Run a quick verification (inline `node -e` test) rather than starting the full dev server
- Update MEMORY.md phase status when completing a plan phase
- Keep CLAUDE.md API docs current when adding/changing endpoints

**What NOT to do:**

- Don't re-explore completed phases — trust MEMORY.md status
- Don't read the master plan file unless specifically working on phase planning
- Don't load skills unless the task directly matches (e.g., don't load `express-patterns` for a frontend-only change)
- Don't use Task/subagents for single-file searches — use Glob/Grep directly
