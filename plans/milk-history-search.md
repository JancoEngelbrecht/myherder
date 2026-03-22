# Milk History — Advanced Search & Pagination

> Status: COMPLETE

## Overview

Replace the MilkHistoryView's time-range chips + "Load more" with date pickers, text search, collapsible advanced filters, and PaginationBar.

## Tasks

### Phase 1: Backend (server/routes/milkRecords.js)

- [x] Add `search` (string, max 100) and `discarded` (boolean) to querySchema
- [x] Update `applyFilters()`: search LIKE on `c.tag_number`, `c.name`, `u.full_name`; discarded filters `mr.milk_discarded = 1`
- [x] Add `GET /api/milk-records/recorders` — distinct users who recorded milk on the farm
- [x] Backend tests for search + discarded + recorders

### Phase 2: Frontend (client/src/views/MilkHistoryView.vue)

- [x] Remove time-range chips → from/to date pickers (default: 3 months ago → today)
- [x] Add SearchInput below dates (searches cow tag/name + recorded-by name)
- [x] Add collapsible advanced filters panel:
  - Session chips (moved from top level)
  - CowSearchDropdown (reuse existing molecule)
  - Discarded-only toggle chip
  - Recorded-by select dropdown (populated from /recorders endpoint)
- [x] Replace "Load more" with PaginationBar
- [x] Summary bar: current page count + litres only
- [x] Keep offline fallback logic

### Phase 3: i18n + Tests

- [x] Add i18n keys to en.json and af.json
- [x] Update MilkHistoryView.test.js (remove load-more tests, add pagination + advanced filter tests)

## Files Modified

- `server/routes/milkRecords.js` — search, discarded params + /recorders endpoint
- `server/tests/milkRecords.test.js` — new test cases
- `client/src/views/MilkHistoryView.vue` — full rewrite
- `client/src/i18n/en.json` — milkHistory keys
- `client/src/i18n/af.json` — milkHistory keys
- `client/src/tests/MilkHistoryView.test.js` — updated tests
