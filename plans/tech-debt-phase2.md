# Tech Debt Phase 2 — Code Quality (Deduplication, Drift, Lint, Cleanup)

## Goal

Eliminate duplicated logic, fix pattern drift, resolve all lint errors, clean up knip config. Every change is safe and isolated — no behavior changes, no new features.

**Note:** No frontend source changes — `client/dist` rebuild NOT required.

---

## Execution Order

1. Fix lint errors (6 files)
2. Deduplicate `toCode()` — remove from globalDefaults.js, import from constants.js
3. Deduplicate `MAX_SEARCH_LENGTH` — remove from milkRecords.js, import from constants.js
4. Standardize `validateBody()`/`validateQuery()` in breedTypes.js and issueTypes.js
5. Clean up knip.json config hints
6. Run full test suite

---

## Step 1. Fix lint errors (6 files)

### 1a. `server/seeds/001_initial_data.js` line 40 — unused `_`

**Change:** Rename `_` to `_result` or remove it. The `_` is the unused first arg in a `.map()` callback.

### 1b. `server/index.js` lines 11, 17 — `process.exit()`

**Change:** These are in the top-level server startup (port binding failure). `process.exit()` is correct here — this is a CLI entry point, not a library. Add `// eslint-disable-next-line n/no-process-exit` before each call.

### 1c. `server/seeds/demo_farm_seed.js` lines 1, 133, 964, 967

- Line 1: shebang (`#!/usr/bin/env node`) — the file is a standalone script, shebang is correct. Add `/* eslint-disable n/hashbang */` at top.
- Lines 133, 964, 967: `process.exit()` — same rationale as 1b, these are script exit points. Add `// eslint-disable-next-line n/no-process-exit` before each.

### 1d. `server/seeds/production/001_super_admin.js` lines 19, 54

**Change:** Remove the unused `eslint-disable` directives. Fixable with `--fix`.

### 1e. `server/tests/analytics/kpi.test.js` line 60 — unused `createBreedingEvent`

**Change:** Remove the unused import from the destructured helper.

### 1f. `client/src/stores/treatments.js` line 79 — `breedTypeMap` should use `const`

**Change:** Change `let breedTypeMap` to `const breedTypeMap`.

**Verification:** `npm run lint` returns 0 errors, 0 warnings.

**Risk:** LOW — lint-only changes. `eslint-disable` comments on entry-point scripts are standard practice.

---

## Step 2. Deduplicate `toCode()` (SAFE)

**Problem:** `toCode()` is defined in both `server/helpers/constants.js` (caps at 50 chars) and `server/routes/globalDefaults.js` (no cap). Different behavior for names > 50 chars.

**Fix:**

- Remove the local `toCode()` from `globalDefaults.js` (line 100-102)
- Add `toCode` to the destructured import from `constants.js` (line 10)
- The `constants.js` version with the 50-char cap is the canonical one — global defaults should also respect this cap for consistency

**Pre-check:** Are there any global default names > 50 chars? Unlikely (breed types like "Holstein Friesian", issue types like "Mastitis"). The cap is a safety measure.

**Verification:** `npx jest server/tests/globalDefaults.test.js` passes.

**Risk:** SAFE — the only behavioral difference (50-char cap) won't trigger for any realistic name.

---

## Step 3. Deduplicate `MAX_SEARCH_LENGTH` (SAFE)

**Problem:** `milkRecords.js` line 22 defines `const MAX_SEARCH_LENGTH = 100` locally instead of importing it from `constants.js` where it's already exported.

**Fix:**

- Remove line 22 (`const MAX_SEARCH_LENGTH = 100`)
- Add `MAX_SEARCH_LENGTH` to the destructured import from `constants.js` on line 9

**Verification:** `npx jest server/tests/milkRecords.test.js` passes.

**Risk:** SAFE — same value (100), just removing the redundant local definition.

---

## Step 4. Standardize `validateBody()`/`validateQuery()` in reference files (SAFE)

**Problem:** `breedTypes.js` and `issueTypes.js` — the project's documented "reference pattern" files — use raw `schema.validate(req.body)` instead of the standard `validateBody(schema, req.body)` wrapper. The wrapper enforces `{ abortEarly: false, stripUnknown: true }` which the raw calls don't.

### 4a. `breedTypes.js`

- Import `validateBody, validateQuery` from `constants.js`
- Line 58: Replace `schema.validate(req.body)` → `validateBody(schema, req.body)`
- Line 86: Replace `schema.validate(req.body)` → `validateBody(schema, req.body)`
- GET handler: Replace `breedTypeQuerySchema.validate(req.query, { allowUnknown: false })` → `validateQuery(breedTypeQuerySchema, req.query)`

### 4b. `issueTypes.js`

- Import `validateBody, validateQuery` from `constants.js`
- Line 67: Replace `schema.validate(req.body)` → `validateBody(schema, req.body)`
- Line 95 (if exists): Same for PUT handler
- GET handler line 32: Replace `issueTypeQuerySchema.validate(req.query, { allowUnknown: false })` → `validateQuery(issueTypeQuerySchema, req.query)`

**Behavioral note:** `validateBody` adds `{ abortEarly: false, stripUnknown: true }`. This means:

- `abortEarly: false` — returns ALL validation errors, not just the first. Strictly better UX.
- `stripUnknown: true` — silently strips extra fields from the body. This is a minor behavioral change but is a security improvement (prevents unexpected fields reaching the DB).

**Verification:** `npx jest server/tests/breedTypes.test.js` + `npx jest server/tests/issueTypes.test.js` pass.

**Risk:** LOW — the `stripUnknown` change could theoretically break a client sending extra fields, but the existing tests cover the happy paths and the extra-field stripping is defensive.

---

## Step 5. Clean up knip.json config hints (SAFE)

**Problem:** Knip reports 7 configuration hints — stale entries that are redundant or unnecessary.

**Fix:** Update `knip.json`:

- Remove `better-sqlite3` and `mysql2` from `ignoreDependencies` (knip says they're redundant)
- Remove redundant `entry` patterns that knip already discovers automatically: `server/index.js`, `knexfile.js`, `jest.config.js`, `src/main.js`, `vite.config.js`

**Verification:** `npm run knip` shows 0 config hints (only the `vue-eslint-parser` unlisted dep remains, which is a valid finding — it IS used in eslint.config.js but not listed in package.json).

**Risk:** SAFE — knip config changes don't affect runtime or tests. If a removal causes knip to report false positives, we re-add it.

---

## Out of Scope (deferred to Phase 3)

- Semicolon style normalization (cows.js, auth.js, analytics/) — Prettier can handle this but it creates massive diffs for zero value
- `auth` → `authenticate` import rename in cows.js — would touch many lines due to semicolons
- `$t()` → `t()` migration in 15 views — works fine, purely cosmetic
- `.content` → `.page-content` in 4 views — would need CSS verification
- `:show-back="true"` → `show-back` — purely cosmetic
- `IssueDetailView` missing `back-to` — minor UX fix
- Oversized file splitting (CowDetailView, LogBreedingView) — Phase 3
- Magic numbers (rate limit windows, debounce, stale hours) — LOW value
- Inline spinner/retry button styles → CSS classes — LOW value
