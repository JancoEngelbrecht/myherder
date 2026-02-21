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

No test framework is currently installed.

## Architecture

**Backend:** Express on port 3000 serving REST API at `/api/*`. In production, also serves the Vue SPA from `client/dist/` with a catch-all route.

**Frontend:** Vue 3 (Composition API) + Pinia stores + vue-router + vue-i18n v11. Vite dev server on port 5173 proxies `/api` requests to localhost:3000.

**Database:** Knex with better-sqlite3 in dev (`./dev.sqlite3`), MySQL2 in production. Config in `knexfile.js`; singleton instance exported from `server/config/database.js`.

**Offline/PWA:** `vite-plugin-pwa` with NetworkFirst strategy for `/api` routes (10s timeout). Dexie.js IndexedDB (`myherder_db`) stores `cows` and `auth` tables. The cows Pinia store falls back to IndexedDB when API calls fail.

**Auth:** Two login modes — admin password (`POST /api/auth/login`, 24h JWT) and worker PIN (`POST /api/auth/login-pin`, 7d JWT). JWT payload includes `{ id, username, full_name, role, permissions[], language }`. Admin role bypasses permission checks; workers need specific permissions (e.g., `can_manage_cows`). Token stored in both localStorage and IndexedDB.

## API Conventions

- All routes except `/api/auth/*` require `Authorization: Bearer <token>`
- `GET /api/cows` returns a **plain array**, not `{ cows: [] }`
- `GET /api/cows/:id` returns cow with `sire_name`/`dam_name` as strings (not nested objects)
- Cow date field is `dob`, not `date_of_birth`
- `GET /api/analytics/herd-summary` returns `{ total, by_status: [{status, count}] }`
- Cows API supports `search`, `status`, `page`, `limit` query params — no `sex` or client-side-only filters
- Soft delete: `DELETE /api/cows/:id` sets `deleted_at` (admin only)
- **Cow IDs are UUIDs** — never use `Number(route.params.id)`
- `GET /api/medications` — active only; `?all=1` for all (admin)
- `GET /api/treatments?cow_id=X` — with medication/user names joined; `GET /api/treatments/withdrawal` — latest per cow on withdrawal; POST auto-calculates `withdrawal_end_milk`/`withdrawal_end_meat`
- `GET/POST /api/health-issues`, `PATCH /api/health-issues/:id/status`, `DELETE /api/health-issues/:id`
- `affected_teats` stored as JSON string in SQLite — always `JSON.parse()` when reading
- `GET /api/issue-types` — active only; `?all=1` for all; CRUD admin-only; DELETE blocked if `code` referenced in `health_issues`; `code` is immutable slug auto-generated from `name`

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

Master plan in `dairy-farm-plan-final.md`. Phase 1 (backend API) and Phase 2 (Vue PWA frontend) are complete. Phases 3-7 cover milk recording, breeding, health, feeding, and reports.

## Environment

Copy `.env.example` to `.env`. Key vars: `JWT_SECRET` (required in production), `DB_PATH` (SQLite file, default `./dev.sqlite3`), `PORT` (default 3000). Production uses `DB_HOST/PORT/USER/PASSWORD/NAME` for MySQL.
