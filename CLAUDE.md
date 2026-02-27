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

Tests: `cd client && npm run test:run` (Vitest). Lint: `npm run lint` / `npm run lint:fix`.

## Architecture

**Backend:** Express on port 3000 serving REST API at `/api/*`. In production, also serves the Vue SPA from `client/dist/` with a catch-all route.

**Frontend:** Vue 3 (Composition API) + Pinia stores + vue-router + vue-i18n v11. Vite dev server on port 5173 proxies `/api` requests to localhost:3000.

**Database:** Knex with better-sqlite3 in dev (`./dev.sqlite3`), MySQL2 in production. Config in `knexfile.js`; singleton instance exported from `server/config/database.js`.

**Offline/PWA:** `vite-plugin-pwa` with NetworkFirst strategy for `/api` routes (10s timeout). Dexie.js IndexedDB (`myherder_db`) stores `cows` and `auth` tables. The cows Pinia store falls back to IndexedDB when API calls fail.

**Auth:** Two login modes — admin password (`POST /api/auth/login`, 24h JWT) and worker PIN (`POST /api/auth/login-pin`, 7d JWT). `POST /api/auth/refresh` renews a valid JWT (auto-called when <1h from expiry). Offline login falls back to cached JWT in IndexedDB if not expired. JWT payload includes `{ id, username, full_name, role, permissions[], language }`. Admin role bypasses permission checks; workers need specific permissions (e.g., `can_manage_cows`). Token stored in both localStorage and IndexedDB.

## API Conventions

- All routes except `/api/auth/*` require `Authorization: Bearer <token>`
- `GET /api/cows` returns a **plain array**, not `{ cows: [] }`
- `GET /api/cows/:id` returns cow with `sire_name`/`dam_name` strings + `breed_type_name`/`breed_type_code` via left-joins
- Cow date field is `dob`, not `date_of_birth`
- `GET /api/analytics/herd-summary` returns `{ total, by_status: [{status, count}] }`
- Cows API supports `search`, `status`, `sex`, `breed_type_id`, `is_dry`, `page`, `limit` query params
- Soft delete: `DELETE /api/cows/:id` sets `deleted_at` (admin only)
- **Cow IDs are UUIDs** — never use `Number(route.params.id)`
- `GET /api/medications` — active only; `?all=1` for all (admin)
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
- `GET /api/sync/health` — no auth, returns `{ ok, timestamp }` (connectivity check)
- `POST /api/sync/push` — batch push client changes; body `{ deviceId, changes: [{ entityType, action, id, data, updatedAt }] }`; returns `{ results: [{ id, entityType, status, serverData?, error? }] }`; LWW conflict resolution
- `GET /api/sync/pull?since=<ISO>&full=1` — pull server data; returns `{ cows, medications, treatments, healthIssues, milkRecords, breedingEvents, breedTypes, issueTypes, deleted, syncedAt }`

## i18n

Two locales: `en.json` and `af.json` in `client/src/i18n/`. Locale persisted to `localStorage('locale')`. All user-facing strings must have entries in both files. Keys are namespaced: `nav`, `login`, `dashboard`, `cows`, `cowForm`, `cowDetail`, `status`, `sex`, `analytics`, `common`, `sync`, `placeholder`.

## Frontend Component Architecture (Atomic Design)

All frontend components live under `client/src/components/` in atomic tiers:

| Tier | Path | Contents |
|------|------|----------|
| **atoms** | `components/atoms/` | SyncIndicator — purely visual, no children |
| **molecules** | `components/molecules/` | TeatSelector, CowSearchDropdown, **ConfirmDialog** |
| **organisms** | `components/organisms/` | AppHeader, BottomNav, CowCard |
| **views** | `src/views/` | Full pages — never import from `components/` root |

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

## Project Phases

Master plan in `PLAN.md`. Feature sub-plans in `plans/` folder. See `MEMORY.md` for current phase status — always check before starting work.

### Sub-Plan Workflow
When the user says "make this a feature sub-plan" (or similar):
1. Create `plans/<feature-name>.md` with detailed implementation steps
2. Add a `> Sub-plan: [plans/<feature-name>.md](plans/<feature-name>.md)` link under the relevant phase in `PLAN.md`
3. Track sub-phase progress in `MEMORY.md` as work proceeds
4. When complete, mark the sub-plan link in `PLAN.md` with `(COMPLETE)`

Existing sub-plans: `plans/breeding-v2.md` (COMPLETE), `plans/offline-sync.md` (COMPLETE)

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
