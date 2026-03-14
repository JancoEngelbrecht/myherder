# Design Modernization Plan

> Status: IN PROGRESS

## Goal
Modernize the color palette, tokenize hardcoded colors, and add component polish (hover effects, micro-interactions).

## Phase A: Color & Token Refresh

### A-1: Update `:root` tokens in style.css
- [x] Primary: `#2D6A4F` → `#059669` (emerald) with matching light/dark/bg
- [x] `--success` stays aliased to `--primary`
- [x] Neutrals: warm beige → cool gray
- [x] Add tokens: `--purple`, `--overlay`, `--grid-color`, `--primary-ring`, `--withdrawal`, `--warning-dark`, `--sex-female-bg`, `--sex-male-bg`
- [x] Fix focus ring `rgba(45,106,79,0.15)` → `var(--primary-ring)`
- [x] Fix `.form-select` SVG data URI hardcoded stroke

### A-2: PWA manifest + meta
- [ ] `manifest.json` theme_color → `#059669`
- [ ] `manifest.json` background_color → `#F9FAFB`
- [ ] `index.html` meta theme-color → `#059669`

### A-3: Badge tokenization in style.css
- [ ] `.badge-dry`, `.badge-pregnant`, `.badge-dead` → CSS variables
- [ ] `.badge-phase-*` → CSS variables

### A-4: Chart colors
- [ ] `useAnalytics.js` chartColors → new values
- [ ] `useAnalytics.js` grid color → `--grid-color` value
- [ ] `useAnalytics.test.js` assertion update

### A-5: Components (8 files)
- [ ] SyncIndicator.vue
- [ ] SyncPanel.vue
- [ ] AnnouncementBanner.vue
- [ ] CowCard.vue
- [ ] CowSearchDropdown.vue
- [ ] ConfirmDialog.vue
- [ ] ToastMessage.vue
- [ ] BreedingEventCard.vue

### A-6: Views (~12 files)
- [ ] DashboardView.vue (stat chips, action cards)
- [ ] CowDetailView.vue (sex avatars, parent cards)
- [ ] ProfileView.vue (role badges)
- [ ] WithdrawalListView.vue (withdrawal brown)
- [ ] LogIssueView.vue (border color)
- [ ] AnnouncementsView.vue (type badges)
- [ ] AuditLogView.vue (warning-dark fallback)
- [ ] UserManagement.vue (warning-dark fallback)
- [ ] BreedingNotificationsView.vue (color-mix hardcoded primary)
- [ ] Analytics views (inline JS chart hex arrays)

## Phase B: Component Polish

### B-1: Hover & focus
- [ ] Card hover lift (`transform: translateY(-2px)`, no box-shadow transition)
- [ ] Button hover states
- [ ] Ghost button variant (`.btn-ghost`)
- [ ] Enhanced `:focus-visible` rings

### B-2: Micro-interactions
- [ ] Chip active animation
- [ ] Improved page transitions
- [ ] Rules: compositor-safe only, no `transition: all`

## Post-build
- [ ] Run frontend tests + lint
- [ ] Rebuild client/dist
- [ ] Commit

## Decisions
| Decision | Choice |
|----------|--------|
| `--success` vs `--primary` | Keep aliased |
| Chart colors JS vs CSS | Keep duplicated (Option A) |
| Spacing scale migration | Deferred (separate PR) |
| Dark mode | Deferred (separate feature) |
