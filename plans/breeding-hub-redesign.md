# Breeding Hub Redesign — Sub-Plan

## Goal
Simplify the Breeding Hub into a clean dashboard with 2 navigation cards + stats + FAB.
Move all notification/alert content to a new dedicated Notifications page with category filter chips.

## Current State
- `BreedingHubView.vue` — monolithic page showing: Needs Attention, Stats, Upcoming (4 groups), Recent Events, FAB
- `BreedingEventsView.vue` — paginated event history with type filter chips + advanced filters
- `/api/breeding-events/upcoming` — returns `{ heats, calvings, pregChecks, dryOffs, needsAttention }`
- Store: `breedingEvents.js` — has `upcoming` reactive object + `upcomingCount` computed

## Design

### Breeding Hub (`/breed`) — simplified dashboard
```
[ Stats Row: Pregnant | Open | Due Soon ]

[ 🔔 Notifications                  🔴 8 ]
[    3 overdue  ·  5 upcoming             ]

[ 📋 Recent Events                    24 ]
[    Last: AI Insemination — C008         ]

                                      [+]
```

### Notifications Page (`/breed/notifications`) — new page
```
[ ← Notifications ]

[ All (8) ] [ Heats (3) ] [ Calvings (1) ] [ Preg Checks (2) ] [ Dry-Offs (2) ]

── NEEDS ATTENTION ──
C008 Patches    Overdue Heat     [Dismiss]
C023 Wilna      Overdue Check    [Dismiss]

── UPCOMING ──
C007 Star       3d
C013 Hettie     5d
...
```

**Filter behavior:**
- **All** (default): grouped layout — Needs Attention header, then each upcoming category with its own header
- **Category filter** (e.g. Heats): flat list, overdue items first (red badge), then upcoming sorted by date ascending. No sub-headers needed since it's all one type
- Each chip shows count: `Heats (3)`
- Dry-Off items keep accept/reject actions regardless of filter

---

## Phases

### Phase 1: Create Notifications View + Route
**Files:** new `client/src/views/BreedingNotificationsView.vue`, `client/src/router/index.js`, `client/src/i18n/en.json`, `client/src/i18n/af.json`

1. Add i18n keys needed for this view:
   ```
   breeding.notificationsTitle     — "Notifications" / "Kennisgewings"
   breeding.filterAll              — "All" / "Alles"
   breeding.filterHeats            — "Heats" / "Hits"
   breeding.filterCalvings         — "Calvings" / "Kalwings"
   breeding.filterPregChecks       — "Preg Checks" / "Drag. Toetse"
   breeding.filterDryOffs          — "Dry-Offs" / "Droogmaak"
   breeding.upcomingHeader         — "Upcoming" / "Aankomend"
   ```

2. Create `BreedingNotificationsView.vue` with:
   - AppHeader with `show-back` and `back-to="/breed"`
   - Filter chips row: All, Heats, Calvings, Preg Checks, Dry-Offs — each with count badge
   - Reuse the existing alert rendering patterns from current BreedingHubView (needs attention section, alert groups with dismiss/dry-off actions)
   - "All" filter: shows Needs Attention group at top, then upcoming grouped by category (heats, calvings, preg checks, dry-offs) — same as current hub layout
   - Category filter: flat list with overdue first, then upcoming sorted by date — no sub-headers
   - Show more/less toggle per group (same ALERT_PREVIEW=5 pattern)
   - Empty state when no notifications

3. On mount: call `breedingStore.fetchUpcoming()` (same data source as current hub)

4. Add route `/breed/notifications` → `BreedingNotificationsView` (name: `breed-notifications`, requiresAuth)

**Tests:**
5. Create `client/src/tests/BreedingNotificationsView.test.js`:
   - Renders filter chips with correct counts
   - "All" filter shows grouped layout (needs attention header + category headers)
   - Category filter shows flat list (overdue first, then upcoming by date)
   - Dismiss action calls store's `dismissEvent()`
   - Dry-off accept/reject actions work
   - Empty state shown when no notifications
   - Clicking an alert row navigates to cow repro view

**Cleanup:**
6. Run `npm run lint:fix`
7. Run `npm run knip` — check for any dead exports introduced
8. Review: does any logic extracted from the hub into this view have refactor opportunities? (e.g., duplicated date formatting, repeated alert-card rendering that could become a shared molecule)

---

### Phase 2: Redesign Breeding Hub
**Files:** `client/src/views/BreedingHubView.vue`, `client/src/i18n/en.json`, `client/src/i18n/af.json`

1. Add i18n keys needed for this phase:
   ```
   breeding.notificationsCard      — "Notifications" / "Kennisgewings"
   breeding.recentEventsCard       — "Recent Events" / "Onlangse Geleenthede"
   breeding.overdueCount           — "{count} overdue" / "{count} agterstallig"
   breeding.upcomingCount          — "{count} upcoming" / "{count} aankomend"
   breeding.lastEvent              — "Last: {type} — {tag}" / "Laaste: {type} — {tag}"
   ```

2. Remove all alert/upcoming rendering (needs attention section, alert groups, show-more, dismiss dialog, dry-off actions)
3. Remove all related computed/reactive state (showAllAlerts, visibleHeats, etc.)
4. Remove: dismiss dialog, acceptDryOff, openDismiss, doDismiss functions (moved to Notifications view)
5. Keep: stats row (Pregnant / Open / Due Soon)
6. Add **Notifications nav card**:
   - Icon 🔔, title "Notifications", red badge with `upcomingCount + needsAttention.length`
   - Subtitle: "X overdue · Y upcoming" (computed from store)
   - Click → `router.push('/breed/notifications')`
7. Add **Recent Events nav card**:
   - Icon 📋, title "Recent Events", badge with total count
   - Subtitle: one-line preview of latest event (type + cow tag)
   - Click → `router.push('/breed/events')`
8. Keep FAB (+) button
9. Keep loading state and error banner

**Tests:**
10. Create `client/src/tests/BreedingHubView.test.js`:
    - Stats row renders Pregnant / Open / Due Soon counts
    - Notifications card shows combined count badge
    - Notifications card subtitle shows "X overdue · Y upcoming"
    - Clicking Notifications card navigates to `/breed/notifications`
    - Recent Events card shows latest event preview
    - Clicking Recent Events card navigates to `/breed/events`
    - FAB renders and navigates to log breeding view
    - Loading state shown while fetching

**Cleanup:**
11. Run `npm run lint:fix`
12. Run `npm run knip` — specifically check for:
    - Dead CSS classes that belonged to removed alert sections (`.alert-*`, `.needs-attention-*`, show-more styles, etc.)
    - Unused JS imports (ConfirmDialog if no longer used here, alert helper functions)
    - Unused computed properties and reactive state
    - Unused i18n keys that were only used in the old hub layout
13. Remove all identified dead code
14. Review refactor opportunities:
    - Are the stats row and nav cards simple enough, or should nav cards become a reusable molecule?
    - Is the `upcomingCount` computed still in the right place (store vs. view)?

---

### Phase 3: Shared Component Extraction (if needed)
**Files:** TBD based on Phase 1–2 findings

This phase exists to act on refactor opportunities identified in Phases 1 and 2. Skip if none are found.

Candidates to evaluate:
1. **Alert/notification item rendering** — if BreedingNotificationsView duplicates significant rendering logic from the old hub, extract a `BreedingAlertItem.vue` molecule
2. **Nav card component** — if the hub's two nav cards share significant structure and the pattern is likely to repeat elsewhere, extract a `NavCard.vue` molecule
3. **Date-relative helpers** — if "X days ago" / "in X days" formatting is duplicated, extract to a shared util

**Decision rule:** Only extract if the duplication is 15+ lines or the pattern is used 3+ times. Do not over-abstract.

**Tests:**
4. If components are extracted, move/write tests for the extracted components
5. Verify existing tests still pass: `cd client && npm run test:run`

**Cleanup:**
6. Run `npm run lint:fix`
7. Run `npm run knip`

---

### Phase 4: Integration Verification
Manual and automated verification that everything works end-to-end.

1. Verify all functionality preserved:
   - Dismiss works on Notifications page
   - Dry-off accept/reject works on Notifications page
   - Clicking an alert row navigates to cow repro view
   - FAB still works from hub
   - Back navigation: Notifications → Hub → Home
   - Stats row data matches reality
   - Nav card counts update after dismiss/actions
   - Filter chips switch between grouped and flat views correctly

2. Run full test suite: `cd client && npm run test:run` — all tests must pass
3. Run `npm run lint:fix` — zero warnings
4. Run `npm run knip` — zero findings

---

### Phase 5: Final Cleanup & Dead Code Sweep
Comprehensive cleanup pass across all files touched.

1. **Dead CSS sweep:**
   - Remove any orphaned CSS classes in BreedingHubView (alert sections, show-more, dismiss dialog styles)
   - Remove any orphaned CSS classes in BreedingNotificationsView from copy-paste that weren't actually used
   - Check `client/src/style.css` for any global classes only used by removed hub sections

2. **Dead JS sweep:**
   - Check `client/src/stores/breedingEvents.js` — any exports no longer consumed?
   - Check `client/src/config/breedingEventTypes.js` — any unused type constants?
   - Check `client/src/components/molecules/BreedingEventCard.vue` — still used? Props changed?
   - Check for unused i18n keys in `en.json`/`af.json` that belonged to the old hub layout

3. **Dead import sweep** across all modified files:
   - Unused component imports
   - Unused store imports
   - Unused utility/helper imports

4. **Run final checks:**
   - `npm run lint:fix`
   - `npm run knip`
   - `cd client && npm run test:run`
   - `npm run build` — verify production build succeeds with no warnings

5. **Update project docs:**
   - Update `CLAUDE.md` if any API conventions or component architecture changed
   - Update `MEMORY.md` phase status
   - Mark sub-plan as complete in `PLAN.md`

---

## Files Changed Summary
| File | Action |
|------|--------|
| `client/src/views/BreedingNotificationsView.vue` | **NEW** — notifications page with filter chips |
| `client/src/tests/BreedingNotificationsView.test.js` | **NEW** — tests for notifications view |
| `client/src/tests/BreedingHubView.test.js` | **NEW** — tests for redesigned hub |
| `client/src/views/BreedingHubView.vue` | **MODIFY** — simplify to dashboard with nav cards |
| `client/src/router/index.js` | **MODIFY** — add notifications route |
| `client/src/i18n/en.json` | **MODIFY** — add new keys (per phase) |
| `client/src/i18n/af.json` | **MODIFY** — add new keys (per phase) |
| TBD: shared molecules | **NEW/MODIFY** — only if Phase 3 identifies extraction candidates |

## Notes
- No backend changes needed — all data comes from existing `/api/breeding-events/upcoming` endpoint
- No store changes needed — `fetchUpcoming()` already provides all the data
- Filter state is local to the Notifications view (not persisted in URL or store)
- Offline support inherited — `fetchUpcoming()` already has IndexedDB fallback
- i18n keys are added inline with each phase (not deferred) so views render correctly during development
- Phase 3 is conditional — skip if no meaningful refactor opportunities are found in Phases 1–2
