# Icon System & Design Cleanup Plan

Replace emoji icons with Lucide SVG icons across the entire app, and simplify the visual design to match the clean, professional reference (grouped cards, generous whitespace, outlined icons).

## Key Design Decisions

1. **Icon library**: Lucide Vue Next — tree-shakable, 1500+ outlined icons, consistent 24px grid
2. **Wrapper component**: `<AppIcon>` atom — maps semantic names to Lucide components, handles sizing/color
3. **Species icons**: Dynamic species switching preserved via icon name mapping (not emoji)
4. **Grouped card pattern**: Already exists in SettingsView — extend to more views
5. **Design simplification**: Pull back colored left-borders, gradients, colored shadows in favor of clean flat cards

---

## Phase 1 — Icon Foundation

Install Lucide and create the `<AppIcon>` component + icon mapping.

### Tasks

- [ ] **1.1** Install `lucide-vue-next` in client: `cd client && npm install lucide-vue-next`
- [ ] **1.2** Create `client/src/components/atoms/AppIcon.vue` — wrapper that accepts `name` prop (string), `size` prop (number, default 20), `stroke-width` prop (default 1.5), renders the corresponding Lucide icon via dynamic component
- [ ] **1.3** Create `client/src/config/iconMap.ts` — central mapping of semantic icon names to Lucide component imports. Categories:
  - **Nav**: home, cow, milk-bucket, dna, heart-pulse
  - **Actions**: plus, edit, trash-2, chevron-right, chevron-left, x, search, filter
  - **Breeding**: flame, syringe, stethoscope, baby, leaf, calendar-check, circle-check, circle-x, alert-triangle
  - **Health**: stethoscope, pill, activity, thermometer, ban
  - **Farm**: warehouse, settings, users, file-text, clipboard-list, download, upload, shield, globe
  - **Analytics**: bar-chart-3, trending-up, pie-chart, calculator
  - **Status**: check, x, alert-triangle, clock, circle-dot
  - **Misc**: bell, book-open, log-out, help-circle, sync (refresh-cw), eye, lock
- [ ] **1.4** Create species icon config in `client/src/config/speciesIcons.ts` — maps species codes to icon names (cattle: { female: 'cow', male: 'bull' }, sheep: { female: 'sheep', male: 'ram' }) with fallback
- [ ] **1.5** Update `useSpeciesTerms.ts` composable — add `icon` reactive property alongside `emoji` that returns species icon names instead of emoji characters
- [ ] **1.6** Run frontend tests, lint, verify no regressions

**Files:** `client/package.json`, `client/src/components/atoms/AppIcon.vue` (new), `client/src/config/iconMap.ts` (new), `client/src/config/speciesIcons.ts` (new), `client/src/composables/useSpeciesTerms.ts`
**Verify:** `<AppIcon name="home" />` renders an SVG icon. All existing tests pass.

---

## Phase 2 — Shell & Navigation

Replace emoji in the always-visible components: BottomNav, AppHeader, ProfileView, SettingsView.

### Tasks

- [ ] **2.1** BottomNav: Replace emoji tab icons with `<AppIcon>` — home, cow/sheep, milk-bucket (droplets), dna/bull. Keep species-aware switching via icon names from `useSpeciesTerms`
- [ ] **2.2** BottomNav: Style SVG icons — 22px size, 1.5 stroke, `currentColor` for active/inactive states
- [ ] **2.3** AppHeader: Replace back button `‹` with `<AppIcon name="chevron-left" />`
- [ ] **2.4** AppHeader: Replace lang toggle text with proper styling (keep text, just refine)
- [ ] **2.5** ProfileView: Replace emoji icons (⚙, 📖, 🚪) with `<AppIcon>` (settings, book-open, log-out)
- [ ] **2.6** SettingsView: Replace all emoji icons (👥, 💊, 🩺, 🐄, 📋, 📄, 📦, 🔄) with `<AppIcon>` equivalents
- [ ] **2.7** SettingsView: Add icon circles (40px rounded bg like the reference) around each settings icon
- [ ] **2.8** Run tests, lint, verify

**Files:** `BottomNav.vue`, `AppHeader.vue`, `ProfileView.vue`, `SettingsView.vue`
**Verify:** Nav shows clean SVG icons, settings page matches reference grouped-card pattern with icon circles.

---

## Phase 3 — Dashboard & Animal Views

Replace emoji in DashboardView, AnimalCard, AnimalDetailView, AnimalListView.

### Tasks

- [ ] **3.1** DashboardView: Replace super-admin card emoji (🏢, ⚙️, 📢, 🩺, 🔗) with `<AppIcon>`
- [ ] **3.2** DashboardView: Replace herd card species emoji with `<AppIcon>` species icon
- [ ] **3.3** DashboardView: Replace action card emoji (💉, 🩺, 🥛) with `<AppIcon>` in icon circles
- [ ] **3.4** DashboardView: Replace more-options emoji (🚨, 🚫, 📊) with `<AppIcon>`
- [ ] **3.5** AnimalCard: Replace species emoji avatar with `<AppIcon>` in colored circle
- [ ] **3.6** AnimalDetailView: Replace all emoji — hero avatar, lineage parent cards, action buttons, section headers
- [ ] **3.7** AnimalDetailView: Replace health issue type emoji with `<AppIcon>` (use code→icon mapping)
- [ ] **3.8** Run tests, lint, verify

**Files:** `DashboardView.vue`, `AnimalCard.vue`, `AnimalDetailView.vue`
**Verify:** Dashboard and animal views show clean SVG icons throughout.

---

## Phase 4 — Breeding Views

Replace emoji across all breeding-related views and the event type config.

### Tasks

- [ ] **4.1** Update `breedingEventTypes.ts` config: add `icon` field alongside existing `emoji` for each event type (heat→flame, ai_insemination→syringe, bull_service→bull, preg_check_positive→circle-check, preg_check_negative→circle-x, calving→baby, lambing→baby, abortion→alert-triangle, dry_off→leaf)
- [ ] **4.2** BreedingEventCard: Replace emoji with `<AppIcon>` using event type icon field
- [ ] **4.3** BreedingHubView: Replace nav card emoji (🔔, 📋) and stat pill content with `<AppIcon>`
- [ ] **4.4** BreedingNotificationsView: Replace section header emoji (🔥, 🐄, 🩺, 🌿) with `<AppIcon>`
- [ ] **4.5** BreedingEventsView: Replace filter chip emoji with `<AppIcon>` inline
- [ ] **4.6** LogBreedingView: Replace date preview emoji (🐮, 🌿, 🔥, 🩺) with `<AppIcon>`
- [ ] **4.7** AnimalReproView: Replace any breeding emoji references
- [ ] **4.8** Run tests, lint, verify

**Files:** `breedingEventTypes.ts`, `BreedingEventCard.vue`, `BreedingHubView.vue`, `BreedingNotificationsView.vue`, `BreedingEventsView.vue`, `LogBreedingView.vue`, `AnimalReproView.vue`
**Verify:** All breeding views show SVG icons. Event type config has both emoji (for DB/backward compat) and icon fields.

---

## Phase 5 — Health, Treatment & Milk Views

Replace emoji in health, treatment, milk, and withdrawal views.

### Tasks

- [ ] **5.1** LogIssueView: Replace issue type emoji (❓ fallback) with `<AppIcon>` — use issue type code→icon mapping
- [ ] **5.2** LogTreatmentView: Replace ⚠️, ✅, ❓ with `<AppIcon>` (alert-triangle, check, help-circle)
- [ ] **5.3** OpenIssuesView: Replace ❓ fallback emoji with `<AppIcon>`
- [ ] **5.4** IssueDetailView: Replace 🐄, ❓ with `<AppIcon>`
- [ ] **5.5** TreatmentDetailView: Replace 🐄, 🥛, 🥩, 🗑 with `<AppIcon>` (cow, droplets, beef→utensils, trash-2)
- [ ] **5.6** WithdrawalListView: Replace ✅, 🥛, 🥩, 🚫 with `<AppIcon>`
- [ ] **5.7** MilkEntryCard: Replace ⚠ withdrawal warning with `<AppIcon name="alert-triangle" />`
- [ ] **5.8** MilkRecordingView: Clean up any remaining emoji references
- [ ] **5.9** MilkHistoryView: Clean up arrow emoji (→) with `<AppIcon name="arrow-right" />`
- [ ] **5.10** Run tests, lint, verify

**Files:** `LogIssueView.vue`, `LogTreatmentView.vue`, `OpenIssuesView.vue`, `IssueDetailView.vue`, `TreatmentDetailView.vue`, `WithdrawalListView.vue`, `MilkEntryCard.vue`, `MilkRecordingView.vue`, `MilkHistoryView.vue`
**Verify:** All health/treatment/milk views use SVG icons.

---

## Phase 6 — Analytics, Help, Super-Admin & Remaining Views

Replace emoji in analytics, help library, super-admin views, and any remaining files.

### Tasks

- [ ] **6.1** AnalyticsView: Replace category card emoji (📈, 🐄, 🩺, 🥧) with `<AppIcon>` (trending-up, heart-pulse, stethoscope, pie-chart)
- [ ] **6.2** HelpLibraryView: Replace all topic emoji (~24 icons) with `<AppIcon>` equivalents
- [ ] **6.3** Super-admin DefaultsHubView: Replace 💊, 🩺, 🐄, 📤, 🐾 with `<AppIcon>`
- [ ] **6.4** Super-admin AnnouncementsView: Replace announcement type emoji with `<AppIcon>`
- [ ] **6.5** Super-admin remaining views (FarmListView, CreateFarmView, FarmDetailView, SystemHealthView, FarmGroupsView): Replace any emoji
- [ ] **6.6** AnnouncementBanner molecule: Replace type emoji with `<AppIcon>`
- [ ] **6.7** LoginView: Replace 🐄 logo with app name text or SVG logo (clean text-only login hero)
- [ ] **6.8** SuperAdminLoginView: Same logo treatment
- [ ] **6.9** Sweep: grep all .vue files for remaining emoji, replace any stragglers
- [ ] **6.10** Run tests, lint, verify

**Files:** `AnalyticsView.vue`, `HelpLibraryView.vue`, `DefaultsHubView.vue`, `AnnouncementsView.vue`, super-admin views, `AnnouncementBanner.vue`, `LoginView.vue`, `SuperAdminLoginView.vue`
**Verify:** Zero emoji in any Vue template (except dynamic issue-type emoji from DB which stays as data).

---

## Phase 7 — Design Simplification

Pull back the heavy visual effects from the recent CSS modernization to match the clean reference aesthetic.

### Tasks

- [ ] **7.1** style.css: Remove `.card-accent` left-border class, remove `--shadow-colored` usage, simplify `.btn-primary` back to flat (no gradient)
- [ ] **7.2** style.css: Increase default card padding from 16px to 20px. Increase section spacing.
- [ ] **7.3** DashboardView: Remove left-border accents from herd card and action cards. Simplify to clean white cards.
- [ ] **7.4** AnimalCard: Remove left-border accent. Clean flat card with subtle shadow only.
- [ ] **7.5** BreedingHubView: Remove left-border accents from nav cards.
- [ ] **7.6** MilkRecordingView, analytics views: Remove left-border accents.
- [ ] **7.7** Global: Ensure consistent spacing — 24px between sections, 16px card padding, 12px between cards.
- [ ] **7.8** Run all tests, lint, format
- [ ] **7.9** Rebuild client/dist for production

**Files:** `style.css`, `DashboardView.vue`, `AnimalCard.vue`, `BreedingHubView.vue`, `MilkRecordingView.vue`, analytics views
**Verify:** App matches the clean, flat, professional reference aesthetic. No colored borders, no gradients, generous whitespace.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  lucide-vue-next (npm dependency, tree-shaken)      │
├─────────────────────────────────────────────────────┤
│  config/iconMap.ts          (name → Lucide component)│
│  config/speciesIcons.ts     (species → icon names)   │
├─────────────────────────────────────────────────────┤
│  atoms/AppIcon.vue          (wrapper component)      │
│    Props: name, size, strokeWidth, class             │
│    Renders: <component :is="iconMap[name]" />        │
├─────────────────────────────────────────────────────┤
│  Every view/component                                │
│    Before: <span>🐄</span>                           │
│    After:  <AppIcon name="cow" />                    │
└─────────────────────────────────────────────────────┘
```

**Key decisions:**

- **Central iconMap** over inline imports — one place to change icons, DRY, enables icon search/replace
- **Keep emoji in DB/config data** — issue types and breed types store emoji in the database. We add an `icon` field alongside, don't remove emoji (backward compat)
- **`<AppIcon>` wrapper** over raw Lucide imports — abstraction lets us swap icon library later if needed, and centralizes sizing/styling
- **Species icons via config** — not hardcoded in components, species-aware via the same `useSpeciesTerms` composable pattern

---

## Test Matrix

| Codepath / Flow               | Happy path              | Error path                  | Edge case                | Test exists? |
| ----------------------------- | ----------------------- | --------------------------- | ------------------------ | ------------ |
| AppIcon renders known icon    | "home" → SVG            | N/A                         | N/A                      | [ ] new test |
| AppIcon handles unknown icon  | N/A                     | "nonexistent" → null/hidden | N/A                      | [ ] new test |
| BottomNav renders SVG icons   | All tabs visible        | N/A                         | 2-tab vs 4-tab           | [x] existing |
| Species icon switching        | cattle→cow, sheep→sheep | N/A                         | No species config        | [x] existing |
| breedingEventTypes icon field | Each type has icon      | N/A                         | N/A                      | [x] existing |
| Settings grouped cards        | All items render        | N/A                         | Feature flags hide items | [x] existing |

New tests needed: AppIcon.test.ts (renders known icon, handles unknown gracefully).

---

## Failure Modes

| Codepath             | Failure scenario                 | Covered by test? | Error handling?       | Silent failure?       |
| -------------------- | -------------------------------- | ---------------- | --------------------- | --------------------- |
| AppIcon unknown name | Typo in icon name prop           | Yes (new test)   | Yes (renders nothing) | Yes — no icon shown   |
| Lucide tree-shaking  | Unused icons not pruned          | N/A              | N/A                   | No — just bundle size |
| Species icon missing | New species with no icon mapping | Yes (existing)   | Yes (fallback)        | No                    |

No critical gaps.

---

## Performance

- **Lucide tree-shaking**: Only imported icons are bundled. ~1KB per icon. Expect ~50 icons = ~50KB raw, ~15KB gzipped. Acceptable.
- **No runtime cost**: SVG icons are inline, no network requests, no font loading delays.
- **Removed emoji rendering inconsistency**: SVG renders identically across OS/browser. Emoji varies by platform.

---

## Issue Type Icons

Issue types and breed types currently store emoji in the DB. The plan does NOT migrate DB emoji — it adds a code→icon mapping in the frontend config. The `issueTypesStore.getByCode(code)` pattern stays; we add `.icon` alongside `.emoji`.

Same approach for `breedingEventTypes.ts` — add `icon` field, keep `emoji` for backward compat.
