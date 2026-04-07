# Quality Gates Alignment — Adopt mycultivar patterns into myherder

Adopt 5 tooling/config patterns from the mycultivar sister project to bring myherder to the same standard.

## Phase 1 — CI Quality Gates

**Goal:** Add a `quality-gates` job to the deploy workflow that runs lint, type-check, tests, audit, and knip before deployment proceeds.

### Tasks

- [ ] **Task 1:** Add `quality-gates` job to `.github/workflows/deploy.yml` with these steps:
  - Checkout code (actions/checkout@v4)
  - Set up Node.js 24 with npm cache (cache both root and client package-lock.json)
  - Install root dependencies (`npm ci`)
  - Install client dependencies (`cd client && npm ci`)
  - Lint (`npm run lint`)
  - Backend type check (`npm run typecheck`)
  - Frontend type check (`cd client && npx vue-tsc --noEmit`)
  - Backend tests (`npm test`, timeout 5 min)
  - Frontend tests (`cd client && npm run test:run`)
  - Dependency audit (`npm audit --audit-level=high || true` — warn only)
  - Dead code check (`npx knip || true` — warn only)
- [ ] **Task 2:** Add `needs: quality-gates` to the existing `deploy` job so it only runs after gates pass
- [ ] **Task 3:** Verify YAML is valid (no syntax errors)

## Phase 2 — Commitlint

**Goal:** Enforce conventional commits (feat:, fix:, chore:, etc.) via a husky commit-msg hook.

### Tasks

- [ ] **Task 1:** Install devDependencies: `@commitlint/cli` and `@commitlint/config-conventional`
- [ ] **Task 2:** Create `commitlint.config.js` with `extends: ['@commitlint/config-conventional']`
- [ ] **Task 3:** Create `.husky/commit-msg` hook with `npx --no -- commitlint --edit "$1"`
- [ ] **Task 4:** Verify: `echo "bad message" | npx commitlint` fails, `echo "fix: good" | npx commitlint` passes

## Phase 3 — ESLint Security Plugin

**Goal:** Add `eslint-plugin-security` to catch security anti-patterns in server code.

### Tasks

- [ ] **Task 1:** Install devDependency: `eslint-plugin-security`
- [ ] **Task 2:** Add `pluginSecurity` import to `eslint.config.js`
- [ ] **Task 3:** Add `security: pluginSecurity` to the plugins object in both server config blocks (CJS block for `server/**/*.js` and TS block for `server/**/*.ts`)
- [ ] **Task 4:** Add `...pluginSecurity.configs.recommended.rules` to the rules in both server blocks
- [ ] **Task 5:** Disable noisy rules: `'security/detect-object-injection': 'off'` and `'security/detect-non-literal-fs-filename': 'off'`
- [ ] **Task 6:** Run `npm run lint` and fix any new errors (or suppress with inline comments if false positives)

## Phase 4 — Enhanced lint-staged

**Goal:** Move lint-staged config to `.lintstagedrc.js` and add TypeScript type-checking on staged files.

### Tasks

- [ ] **Task 1:** Create `.lintstagedrc.js` with:
  - `'server/**/*.ts': () => 'npm run typecheck'` (full tsc project check)
  - `'client/src/**/*.{ts,vue}': () => 'cd client && npx vue-tsc --noEmit'` (full vue-tsc check)
  - `'*.{js,ts,vue}': ['prettier --write', 'eslint --fix']` (format + lint)
  - `'*.{css,json,md}': ['prettier --write']` (format only)
- [ ] **Task 2:** Remove the `"lint-staged"` key from `package.json`
- [ ] **Task 3:** Verify pre-commit hook still works (the `.husky/pre-commit` already calls `npx lint-staged`)

## Phase 5 — Helmet CSP

**Goal:** Add Content-Security-Policy directives to Helmet config in `server/app.ts`, tailored for myherder.

### Tasks

- [ ] **Task 1:** Replace `app.use(helmet())` with a detailed config:
  ```js
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    })
  )
  ```
- [ ] **Task 2:** Verify server starts without errors
- [ ] **Task 3:** Verify CSP header is present in API responses

### Key Decisions

- `'unsafe-inline'` on styleSrc: required for Vue scoped styles
- Google Fonts (fonts.googleapis.com + fonts.gstatic.com): DM Sans and JetBrains Mono are loaded from Google
- `data:` and `blob:` on imgSrc: needed for inline SVGs and generated chart images
- No map tiles or external APIs: myherder is data-only, unlike mycultivar
