# Phase 8: Milk Recording History & Recording Page Refinement

> Parent: PLAN.md Phase 8
> Status: NOT STARTED

## Problem Statement

The milk recording page has a UX issue: the time picker on past dates suggests filtering behaviour but only stamps new records. When a farmer goes to a past date and changes the time, the displayed records don't change — they're grouped by (cow_id, session, recording_date), not time. There's also no way to audit who recorded what and when.

## Solution

Split the milk feature into two complementary pages:

1. **Milk Recording** (existing `/milk`) — streamlined for fast data entry
2. **Milk History** (new `/milk/history`) — filterable audit trail of all records

---

## Phase 1: Backend — Enhanced Milk Records API

**Goal:** Add pagination, date range filtering, and sorting to `GET /api/milk-records` so the history view can query efficiently.

### 1.1 Enhance GET /api/milk-records

Current params: `?date=YYYY-MM-DD&session=morning&cow_id=UUID`

Add new params (all optional, backward-compatible):

- `from` / `to` — date range filter (ISO date strings)
- `recorded_by` — UUID filter for specific user
- `page` / `limit` — pagination (default page=1, limit=25)
- `sort` — `recording_date` (default), `litres`, `tag_number`
- `order` — `desc` (default), `asc`

When `page`/`limit` are provided, return paginated response:

```json
{
  "data": [{ id, cow_id, tag_number, cow_name, recorded_by, recorded_by_name,
              session, litres, recording_date, session_time, milk_discarded,
              discard_reason, notes, created_at, updated_at }],
  "total": 250
}
```

When called WITHOUT `page`/`limit` (existing behaviour for recording page), return plain array as before — **no breaking change**.

### 1.2 Tests

- Pagination returns correct total + sliced data
- `from`/`to` date range filters correctly
- `recorded_by` filter works
- Sort by litres/date/tag works in both directions
- Plain array still returned when no pagination params (backward compat)
- Empty results return `{ data: [], total: 0 }` with pagination

**Files touched:**

- `server/routes/milkRecords.js` — enhanced GET handler + Joi query schema
- `server/tests/milkRecords.test.js` (NEW) — ~12 tests

**Cleanup:** Review existing GET handler for redundant queries or N+1 patterns.

---

## Phase 2: Frontend — Milk History View

**Goal:** New view showing all milk records with filters and pagination.

### 2.1 MilkHistoryView.vue

**Route:** `/milk/history` (lazy-loaded, requiresAuth, requiresModule: 'milkRecording')

**Layout:**

```
AppHeader: "Milk Records" (show-back, back-to="/milk")
┌──────────────────────────────────────┐
│  Filter chips row (scrollable):      │
│  [Date range] [Session ▾] [Cow ▾]   │
│  [Recorded by ▾]                     │
├──────────────────────────────────────┤
│  Summary bar: "125 records • 1,450 L"│
├──────────────────────────────────────┤
│  Record card list (paginated):       │
│  ┌────────────────────────────────┐  │
│  │ C001 Bella     12.5 L  ✓      │  │
│  │ Morning • 25 Feb 2026 • 06:30 │  │
│  │ Recorded by: Admin             │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ C003 Rosie      8.0 L  ⚠      │  │
│  │ Morning • 25 Feb 2026 • 06:30 │  │
│  │ Discarded (withdrawal)         │  │
│  └────────────────────────────────┘  │
│  ... more cards ...                  │
│  [Load more] or pagination           │
└──────────────────────────────────────┘
```

**Filters:**

- **Date range:** Reuse `useTimeRange()` composable from analytics (7d, 30d, 90d, 12m, custom)
- **Session:** chip toggle (all / morning / afternoon / evening)
- **Cow:** text search (tag_number or name, passed as `cow_id` after lookup or as search param)
- **Recorded by:** dropdown of users (fetch from `/api/users?active_only=1`)

**Pagination:** "Load more" button at bottom (appends to list, not page replacement) — better for mobile. Track `page` in state, increment on click.

### 2.2 MilkRecordCard molecule (NEW)

`client/src/components/molecules/MilkRecordCard.vue`

A read-only card for the history list. Different from MilkEntryCard (which has an input).

**Props:** `record` object (from API with joined fields)

**Displays:**

- Cow tag + name (left)
- Litres + discarded badge (right)
- Session name + date + time (bottom row)
- Recorded by name (bottom row)
- Visual indicators: discarded (red tint), withdrawal icon

### 2.3 Navigation

- Recording page (`/milk`): Add a "View history" link/button in the header or below controls
- History page: AppHeader with back-to="/milk"
- Bottom nav: Milk icon stays on `/milk` (recording), history is a sub-page

### 2.4 i18n Keys

New keys under `milkHistory` namespace:

```json
{
  "milkHistory": {
    "title": "Milk Records",
    "filterSession": "Session",
    "filterAll": "All",
    "filterCow": "Cow",
    "filterRecordedBy": "Recorded by",
    "summaryCount": "{count} records",
    "summaryLitres": "{litres} L",
    "loadMore": "Load more",
    "noRecords": "No milk records found",
    "discardedLabel": "Discarded",
    "recordedBy": "Recorded by: {name}",
    "viewHistory": "View records"
  }
}
```

Both `en.json` and `af.json`.

### 2.5 Tests

`client/src/tests/MilkHistoryView.test.js` — ~12 tests:

- Renders record list from API
- Filter chips update query params and re-fetch
- Pagination "load more" appends records
- Empty state shown when no records
- Discarded records show indicator
- Session filter works
- Date range filter works
- Summary bar shows correct totals

`client/src/tests/MilkRecordCard.test.js` — ~8 tests:

- Renders cow info, litres, session, date, time
- Discarded styling applied
- Recorded-by name shown
- Handles missing optional fields (no name, no time, no notes)

**Files touched:**

- `client/src/views/MilkHistoryView.vue` (NEW)
- `client/src/components/molecules/MilkRecordCard.vue` (NEW)
- `client/src/router/index.js` — add `/milk/history` route
- `client/src/i18n/en.json` — milkHistory keys
- `client/src/i18n/af.json` — milkHistory keys
- `client/src/views/MilkRecordingView.vue` — add "View history" link
- `client/src/tests/MilkHistoryView.test.js` (NEW)
- `client/src/tests/MilkRecordCard.test.js` (NEW)

**Cleanup:** Check for any shared logic between MilkRecordCard and MilkEntryCard that could be extracted. Review i18n for unused keys.

---

## Phase 3: Recording Page Refinement

**Goal:** Clarify the time picker UX and improve the recording flow.

### 3.1 Always Show Time Picker

Currently the time picker is hidden for today's date and `session_time` is stored as `null`. Change:

- **Always show** the time picker (today defaults to current HH:MM, past defaults to session standard)
- Today: pre-fill with current time rounded to nearest 15 min (e.g., 06:45)
- Auto-update current time when session tab changes (if today)
- Store `session_time` for ALL records (not just past dates)

This removes the confusing conditional display and gives a consistent UX.

### 3.2 Backend Compatibility

- `session_time` is already nullable in the DB — no migration needed
- Records with `null` session_time continue to work (backward compatible)
- New records get `session_time` populated even for today

### 3.3 Simplify handleUpdate

Currently builds discard reason with English-only string. Move to i18n key and clean up the handler.

### 3.4 Tests

Update `client/src/tests/MilkRecordingView.test.js` (NEW or added to existing):

- Time picker always visible
- Today defaults to current time (rounded)
- Past date defaults to session standard
- Session change updates time for today
- Summary footer accuracy
- Search filtering

Update `client/src/tests/milkRecords.store.test.js`:

- session_time now sent for today's records too
- Verify time formatting

**Files touched:**

- `client/src/views/MilkRecordingView.vue` — always show time, update defaults
- `client/src/stores/milkRecords.js` — update \_persist to always send session_time
- `client/src/tests/MilkRecordingView.test.js` (NEW or updated)
- `client/src/tests/milkRecords.store.test.js` — updated tests

**Cleanup:** Remove `isToday` conditional for time picker. Remove dead sessionTime null logic. Run Knip for dead exports.

---

## Phase 4: Polish & Final Cleanup

**Goal:** Ensure everything is tight — no dead code, consistent patterns, all tests green.

### 4.1 Cross-cutting cleanup

- Run `npm run knip` — remove any dead exports/files
- Run `npm run lint:fix` — fix any style issues
- Review MilkEntryCard for any dead props or unused computed properties
- Verify summary footer counts are correct after changes
- Ensure both pages work offline (history view should gracefully degrade)

### 4.2 Update documentation

- Update CLAUDE.md with new `/milk/history` route and API changes
- Update MEMORY.md with phase status

### 4.3 Final test run

- Run full client test suite: `cd client && npm run test:run`
- Run server tests: `cd server && npx jest`
- Verify all tests pass with 0 failures

**Files touched:**

- `CLAUDE.md` — API docs for enhanced GET /api/milk-records
- `MEMORY.md` — phase status update

---

## Summary

| Phase | Description                                  | New Files                                             | Tests           |
| ----- | -------------------------------------------- | ----------------------------------------------------- | --------------- |
| 1     | Backend: paginated milk records API          | milkRecords.test.js                                   | ~12             |
| 2     | Frontend: Milk History view + MilkRecordCard | MilkHistoryView.vue, MilkRecordCard.vue, 2 test files | ~20             |
| 3     | Recording page: always-show time picker      | —                                                     | ~8              |
| 4     | Polish, dead code removal, docs              | —                                                     | verify all pass |

**Total new tests:** ~40
**Total new files:** 4 source + 3 test files
**No migrations needed** — existing schema supports all changes
