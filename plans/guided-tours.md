# Guided Feature Tours Plan

> Status: COMPLETE
> Library: driver.js (v1.4.0, MIT, ~5KB gzip, zero deps)
> Sub-plan of: Help Library / Onboarding

## Overview

Per-feature guided tours using driver.js. Each tour highlights key UI elements with tooltip popovers, walking users through the feature step-by-step. Tours are mandatory on first visit to a feature, and re-launchable via a button.

## Design Decisions

- **Library**: driver.js — MIT, 5KB, programmatic API, no Vue wrapper needed
- **Tour scope**: One tour per feature module (not one giant tour)
- **Trigger**: Auto-show on first visit; "Start Tour" FAB/button to replay
- **State**: localStorage key per user+farm+tour (e.g. `tour_completed_milk_recording_{userId}_{farmId}`)
- **i18n**: All tour step text via vue-i18n `t()` keys in a `tour` namespace
- **Mobile-first**: Steps target elements that exist on mobile layout; popovers positioned with driver.js auto-placement
- **Feature flags**: Only show tours for enabled features
- **Permissions**: Only show tours for features the user has access to

## Tours to Build

| Tour ID          | Feature               | Target View       | Steps (approx) | Permission         |
| ---------------- | --------------------- | ----------------- | -------------- | ------------------ |
| `dashboard`      | Dashboard overview    | DashboardView     | 4              | any                |
| `cow-list`       | Browsing cows         | CowListView       | 4              | any                |
| `milk-recording` | Recording milk        | MilkRecordingView | 5              | can_record_milk    |
| `milk-history`   | Milk history          | MilkHistoryView   | 4              | can_record_milk    |
| `health-issues`  | Logging health issues | LogIssueView      | 5              | can_log_issues     |
| `treatments`     | Adding treatments     | LogTreatmentView  | 5              | can_log_treatments |
| `breeding-hub`   | Breeding hub          | BreedingHubView   | 5              | can_log_breeding   |
| `analytics`      | Analytics landing     | AnalyticsView     | 4              | can_view_analytics |
| `settings`       | Admin settings        | SettingsView      | 4              | admin only         |

## Phases

### Phase 1: Infrastructure

> Status: COMPLETE

1. Install driver.js: `cd client && npm install driver.js`
2. Create `client/src/composables/useTour.js` composable:
   - Accepts `tourId`, `steps` (array of `{ element, popover }`)
   - Checks localStorage for completion state: `tour_completed_{tourId}_{userId}_{farmId}`
   - `startTour()` — calls `driver.drive()`
   - `hasCompleted` — reactive ref
   - `markComplete()` — sets localStorage flag
   - `resetTour()` — clears flag (for debugging / "restart tour")
   - Auto-starts if not completed (on `onMounted`)
   - Handles missing elements gracefully (skip step if element not in DOM)
3. Create tour CSS overrides in `client/src/style.css`:
   - `.driver-popover` styled with design system tokens (colors, border-radius, fonts)
   - Mobile-friendly sizing (max-width, padding)
   - Progress dots or step counter
4. Add `tour` i18n namespace to `en.json` and `af.json` (scaffold with shared keys: next, prev, done, skip, stepOf)
5. Create `TourButton.vue` atom — small floating "?" or "Start Tour" button
   - Shows on views that have a tour
   - Emits `start-tour` event

### Phase 2: Core Tours (Dashboard, Cows, Milk)

> Status: COMPLETE

1. Define tour steps for `dashboard`:
   - Welcome message (no element target — centered modal)
   - KPI cards area
   - Quick action buttons
   - Bottom navigation
2. Define tour steps for `cow-list`:
   - Search bar
   - Filter chips
   - Cow card (tap to see details)
   - FAB add button
3. Define tour steps for `milk-recording`:
   - Session selector (AM/PM)
   - Cow search dropdown
   - Litres input
   - Save button
   - Session summary
4. Define tour steps for `milk-history`:
   - Filter chips
   - Search bar
   - Record cards
   - Pagination
5. Wire tours into views: add `useTour()` call + TourButton to each view
6. i18n: Add step text for all 4 tours to en.json and af.json

### Phase 3: Health & Treatment Tours

> Status: COMPLETE

1. Define tour steps for `health-issues` (LogIssueView):
   - Cow selector
   - Issue type dropdown
   - Severity selector
   - Teat selector (conditional)
   - Notes + save
2. Define tour steps for `treatments` (LogTreatmentView):
   - Cow selector
   - Medication dropdown
   - Dosage + cost inputs
   - Health issue link
   - Save + withdrawal info
3. Wire tours into views + TourButton
4. i18n for both tours (en + af)

### Phase 4: Breeding & Analytics Tours

> Status: COMPLETE

1. Define tour steps for `breeding-hub`:
   - Notifications badge
   - Log Event button
   - Event timeline/list
   - Upcoming alerts section
   - Needs Attention section
2. Define tour steps for `analytics`:
   - Category cards (Financial, Fertility, Health, Structure)
   - Time range selector
   - Chart interaction hint
   - Link to reports
3. Wire tours into views + TourButton
4. i18n for both tours (en + af)

### Phase 5: Admin Tour + Polish

> Status: COMPLETE

1. Define tour steps for `settings` (admin only):
   - User management card
   - Breed/issue/medication types
   - Feature flags
   - Reports
   - Audit log
2. Wire tour into SettingsView + TourButton (admin-gated)
3. Add "Reset All Tours" option in ProfileView (re-triggers all tours)
4. i18n for settings tour (en + af)
5. Handle edge cases:
   - Element not in DOM (feature disabled) → skip step
   - User navigates away mid-tour → destroy tour
   - Window resize → driver.js handles via `refresh()`

### Phase 6: Verification & Testing

> Status: COMPLETE

1. Test useTour composable:
   - Starts on first visit
   - Doesn't restart after completion
   - Reset clears state
   - Skips missing elements
2. Test TourButton renders and emits correctly
3. Verify all i18n keys match between en.json and af.json
4. Manual test on mobile viewport (Chrome DevTools)
5. Run full test suite + lint

## Tour Step Template

```js
// In each view's <script setup>
const { startTour } = useTour('milk-recording', [
  {
    element: '#session-selector',
    popover: {
      title: t('tour.milkRecording.session.title'),
      description: t('tour.milkRecording.session.desc'),
    },
  },
  {
    element: '#cow-search',
    popover: {
      title: t('tour.milkRecording.cowSearch.title'),
      description: t('tour.milkRecording.cowSearch.desc'),
    },
  },
  // ...
])
```

## CSS Strategy

Override driver.js defaults with design system tokens:

```css
.driver-popover {
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--radius-lg);
  font-family: var(--font-body);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  max-width: min(360px, 90vw);
}
.driver-popover-title {
  font-weight: 600;
  font-size: 1rem;
}
.driver-popover-description {
  font-size: 0.875rem;
  line-height: 1.5;
}
.driver-popover-footer button {
  /* Use .btn-primary / .btn-secondary patterns */
}
```

## localStorage Key Format

```
tour_completed_{tourId}_{userId}_{farmId}
```

Examples:

- `tour_completed_dashboard_abc123_farm456`
- `tour_completed_milk-recording_abc123_farm456`

This ensures tours reset when a user switches farms (super-admin) or a new user logs in on the same device.
