# UX/UI Modernization Plan

CSS-first approach to make the MyHerder UI more professional and modern. No JS logic changes, no new dependencies, no API changes.

## Key Design Decisions

1. **AppHeader**: Frosted-glass backdrop-filter blur effect
2. **BottomNav**: Pill background behind active tab (iOS style)
3. **Cards**: Softer shadows + subtle left-border accent combined

---

## Phase 1 — Design Foundation

Update global design tokens and utility classes in `style.css`.

### Tasks

- [ ] **1.1** Refine shadow tokens — softer, more layered shadows (`--shadow-sm`, `--shadow`, `--shadow-lg`, `--shadow-card`)
- [ ] **1.2** Add `--shadow-colored` token for primary-tinted card shadows
- [ ] **1.3** Improve typography — add `--text-xs` size, refine `.section-label` letter-spacing and weight
- [ ] **1.4** Add skeleton pulse animation keyframes (`.skeleton`, `.skeleton-text`, `.skeleton-circle`)
- [ ] **1.5** Improve `.spinner` — smoother animation, subtle color fade
- [ ] **1.6** Polish `.empty-state` — larger icon, better spacing, subtle background
- [ ] **1.7** Refine `.form-input` focus state — smoother ring transition, subtle lift
- [ ] **1.8** Polish `.chip` — smoother active transition, subtle shadow on active state
- [ ] **1.9** Add `.card-accent` variant with subtle left-border in primary color
- [ ] **1.10** Improve `.btn-primary` — subtle gradient, better active press state
- [ ] **1.11** Add page-level transition enhancement — smoother slide-up timing

**Files:** `client/src/style.css`
**Verify:** All existing tests pass (CSS-only, no logic changes). Visual diff shows softer shadows, clearer hierarchy.

---

## Phase 2 — Shell Components

Modernize the always-visible AppHeader and BottomNav.

### Tasks

- [ ] **2.1** AppHeader: Add `backdrop-filter: blur(12px)` with `-webkit-` prefix, semi-transparent background fallback
- [ ] **2.2** AppHeader: Refine header shadow — use new softer shadow token
- [ ] **2.3** AppHeader: Avatar circle — add subtle ring/border, slightly larger on hover
- [ ] **2.4** AppHeader: Back button — improve tap target, add subtle hover background
- [ ] **2.5** AppHeader: Language toggle — refine styling to match new design tokens
- [ ] **2.6** BottomNav: Add pill background behind active tab with smooth transition
- [ ] **2.7** BottomNav: Refine icon and label sizing for better visual balance
- [ ] **2.8** BottomNav: Improve shadow — softer, more subtle top edge
- [ ] **2.9** BottomNav: Add subtle scale animation on tap

**Files:** `client/src/components/organisms/AppHeader.vue`, `client/src/components/organisms/BottomNav.vue`
**Verify:** Header has frosted-glass on scroll, active tab has visible pill, transitions are smooth.

---

## Phase 3 — Key View Polish

Modernize Dashboard, AnimalCard/List, and Login views.

### Tasks

- [ ] **3.1** DashboardView: Improve greeting section — better typography weight/size
- [ ] **3.2** DashboardView: Herd card — add left-border accent, refine shadow and hover
- [ ] **3.3** DashboardView: Action cards — add subtle icon circle backgrounds, improve spacing
- [ ] **3.4** DashboardView: Stat chips — refine with better border-radius, subtle inner shadow
- [ ] **3.5** DashboardView: More options section — improve circle icons, better label spacing
- [ ] **3.6** AnimalCard: Add subtle left-border accent (primary color), softer shadow
- [ ] **3.7** AnimalCard: Improve badge layout — tighter grouping, better alignment
- [ ] **3.8** AnimalCard: Desktop grid — better card spacing and hover lift
- [ ] **3.9** AnimalListView: Refine search bar and filter area spacing
- [ ] **3.10** LoginView: Polish PIN keypad — rounder keys, better press feedback
- [ ] **3.11** LoginView: Improve tab switcher — smoother active transition
- [ ] **3.12** LoginView: Refine hero section — subtle text shadow, better gradient

**Files:** `client/src/views/DashboardView.vue`, `client/src/components/organisms/AnimalCard.vue`, `client/src/views/AnimalListView.vue`, `client/src/views/LoginView.vue`
**Verify:** Dashboard feels more structured, animal cards have depth, login is more polished.

---

## Phase 4 — Cross-View Consistency & Build

Apply consistent styling across remaining views and rebuild for production.

### Tasks

- [ ] **4.1** BreedingHubView: Apply card-accent style to nav cards, refine stat pills
- [ ] **4.2** MilkRecordingView: Polish session tabs, improve controls section spacing
- [ ] **4.3** ProfileView: Improve profile header — larger avatar, better role badge, refined settings list
- [ ] **4.4** Analytics views: Ensure `.analytics-card` sections use updated card styles consistently
- [ ] **4.5** BreedingHubView: Improve nav-card hover/active states
- [ ] **4.6** MilkRecordingView: Refine history link and error banner styling
- [ ] **4.7** Run `npm run lint:fix` and `npm run format`
- [ ] **4.8** Run all backend tests (`npm test`) — verify no regressions
- [ ] **4.9** Run all frontend tests (`cd client && npm run test:run`) — verify no regressions
- [ ] **4.10** Rebuild client/dist (`cd client && npm run build`)

**Files:** `client/src/views/BreedingHubView.vue`, `client/src/views/MilkRecordingView.vue`, `client/src/views/ProfileView.vue`, analytics view files
**Verify:** All views have consistent card styling, all tests pass, build succeeds.
