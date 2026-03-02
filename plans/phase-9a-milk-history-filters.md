# Phase 9A: Milk History View — Pagination, Cow Search & Date Range Filters

## Scope

### In scope
1. Replace "load more" with prev/next pagination + page indicator
2. Add cow search filter using existing `CowSearchDropdown` molecule
3. Add custom date range (from/to date inputs) alongside existing time range chips
4. Fix `totalLitres` — currently sums only the loaded page; move to server-side aggregate
5. i18n keys for all new UI (en + af)
6. Update client tests
7. Refactoring, dead code removal, and quality verification after each implementation phase

### Out of scope
- Sort controls (backend has sort/order support — can add later)
- Milk record editing from history view
- PDF/Excel export of filtered results (deferred to Phase 6B)

## Design Decisions (Pre-resolved)
- **Pagination style:** Prev/Next buttons + "Page X of Y" indicator (mobile-first, not numbered pages)
- **Cow filter:** Reuse `CowSearchDropdown` (select one cow by typing tag/name → passes `cow_id` to API)
- **Date range:** Quick preset chips remain (3M/6M/12M/24M); adding a "Custom" chip that reveals from/to date inputs
- **Total litres:** Add `total_litres` to the paginated API response so the summary bar is accurate

## Backend Changes (minimal)

The milk records API already supports `cow_id`, `from`, `to`, `page`, `limit`, `session`. Only one change needed:

**GET /api/milk-records** (paginated mode) — add `total_litres` to response:
```
{ data: [...], total: N, total_litres: 1234.56 }
```

---

## Tasks

### 9A.1 — Backend: Add `total_litres` to paginated response
**Complexity:** S
**Files:** `server/routes/milkRecords.js`, `server/tests/milkRecords.test.js`

**Steps:**
1. In the paginated branch of `GET /`, add a SUM query for `mr.litres` with the same filters
2. Return `total_litres` (rounded to 2 decimals) alongside `data` and `total`
3. Add 2 server tests:
   - Verify `total_litres` is returned in paginated mode
   - Verify `total_litres` respects filters (session, cow_id, date range)

**Acceptance criteria:**
- `GET /api/milk-records?page=1&limit=25` returns `{ data, total, total_litres }`
- `total_litres` is the sum across ALL matching records, not just the page
- Legacy (non-paginated) mode unchanged

**Verify:** Run `server/tests/milkRecords.test.js` — all pass, no regressions

---

### 9A.2 — Frontend: Replace "load more" with prev/next pagination
**Complexity:** M
**Files:** `client/src/views/MilkHistoryView.vue`

**Steps:**
1. Remove the `loadMore()` function and "load more" button
2. Replace `records` accumulation logic with single-page display
3. Add `totalPages` computed (`Math.ceil(total / PAGE_SIZE)`)
4. Add prev/next buttons + "Page X of Y" indicator at bottom
5. Prev disabled on page 1, next disabled on last page
6. Page navigation scrolls to top
7. Use `total_litres` from API response instead of client-side sum

**Acceptance criteria:**
- Shows one page of records at a time (25)
- Prev/next buttons navigate between pages
- Summary bar shows accurate total litres from server
- Changing any filter resets to page 1

**Verify & clean:**
- Remove dead `loadMore` function, `hasMore` computed, accumulated records logic
- Confirm no unused imports remain
- Run existing `MilkHistoryView.test.js` — update any broken tests before proceeding

---

### 9A.3 — Frontend: Add cow search filter
**Complexity:** M
**Files:** `client/src/views/MilkHistoryView.vue`, `client/src/i18n/en.json`, `client/src/i18n/af.json`

**Steps:**
1. Import and add `CowSearchDropdown` above the filter chips
2. Bind to a `cowFilter` ref (cow UUID or null)
3. Pass `cow_id` param to `fetchRecords()` when a cow is selected
4. Add to the `watch` array so changing/clearing cow resets page and re-fetches
5. Add i18n keys: `milkHistory.searchCow` placeholder text

**Acceptance criteria:**
- Typing a tag/name shows matching cows in dropdown
- Selecting a cow filters all records to that cow
- Clearing the cow restores unfiltered results
- Combined with session and date filters (all filters stack)

**Verify & clean:**
- Check CowSearchDropdown `sexFilter` prop — should be `null` (no sex filter for milk history, females only would exclude edge cases)
- Confirm API call includes `cow_id` param only when set (not `cow_id: null`)
- Run tests — all green

---

### 9A.4 — Frontend: Add custom date range filter
**Complexity:** M
**Files:** `client/src/views/MilkHistoryView.vue`, `client/src/i18n/en.json`, `client/src/i18n/af.json`

**Steps:**
1. Add an "All" chip to time range options (no date filter = null from/to)
2. Add a "Custom" chip after the preset chips
3. When "Custom" is selected, show from/to `<input type="date">` fields below the chips
4. Custom date inputs override the preset range; selecting a preset hides the date inputs
5. Pass from/to to fetchRecords (null = no date filter)
6. Add i18n keys: `milkHistory.customRange`, `milkHistory.allTime`, `milkHistory.dateFrom`, `milkHistory.dateTo`

**Acceptance criteria:**
- Preset chips (3M/6M/12M/24M) work as before
- "All" chip removes date filter entirely
- "Custom" chip reveals two date inputs
- Date inputs send exact from/to to API
- Combined with cow and session filters

**Verify & clean:**
- Ensure "Custom" → preset transition clears custom date refs
- Ensure "All" doesn't send `from: null, to: null` as query params (omit them)
- Check that `useTimeRange` composable isn't carrying dead computed state after refactor
- Run tests — all green

---

### 9A.5 — Frontend: Styling & UX polish
**Complexity:** S
**Files:** `client/src/views/MilkHistoryView.vue`

**Steps:**
1. Style pagination bar: centered, with prev/next buttons and page indicator
2. Style cow search: full width above filter chips, with subtle separator
3. Style custom date inputs: inline below chips, responsive layout
4. Ensure filter chips row wraps nicely (2 rows: time presets + session/state)
5. Scroll to top on page navigation

**Acceptance criteria:**
- Mobile-friendly layout (stacked on narrow screens)
- No horizontal overflow on filter rows
- Consistent with app design system (`.btn-secondary`, `.chip` classes)

**Verify & clean:**
- Remove any dead CSS classes left over from the "load more" UI
- Check scoped styles for unused selectors (`.load-more-row`, `.load-more-btn`)
- Visual check at 375px and 768px+ widths

---

### 9A.6 — Tests: Update & expand client tests
**Complexity:** M
**Files:** `client/src/tests/MilkHistoryView.test.js`

**Steps:**
1. Update mock API response to include `total_litres`
2. Replace "load more" tests with pagination tests:
   - Shows pagination bar when records > PAGE_SIZE
   - Next button fetches page 2
   - Prev button fetches page 1 from page 2
   - Buttons disabled at boundaries
3. Add cow filter tests:
   - Cow search dropdown renders
   - Selecting cow passes `cow_id` to API
4. Add date filter tests:
   - "All" chip sends no from/to
   - "Custom" reveals date inputs
   - Date inputs pass from/to to API
5. Verify filter reset: changing any filter resets to page 1

**Acceptance criteria:**
- All existing passing tests still pass (adapted for new pagination)
- At least 6 new tests covering pagination, cow filter, date range
- No skipped tests

**Verify & clean:**
- Remove dead test helpers for "load more" behaviour
- Ensure mock factories (e.g. `mockApiResponse`) reflect new response shape
- Run full client test suite (`cd client && npm run test:run`) — all green, no regressions outside this file

---

### 9A.7 — Final review: refactor, dead code, efficiency audit
**Complexity:** S
**Files:** All files touched in 9A.1–9A.6

**Steps:**
1. **Dead code scan:** Run `npm run knip` — flag any new unused exports, imports, or files
2. **Refactoring review:**
   - Check `fetchRecords()` — ensure no redundant API calls on filter changes (debounce or single watcher)
   - Verify the count + sum queries in backend aren't duplicating work (combine into one query if possible)
   - Look for repeated filter-building logic that could be extracted
3. **Efficiency check:**
   - Confirm only one API call per filter change (not multiple due to cascading watchers)
   - Ensure pagination doesn't re-fetch total on every page nav (total only changes on filter change)
   - Check that CowSearchDropdown doesn't trigger milk-records re-fetch on each keystroke (only on select/clear)
4. **i18n audit:** Confirm no orphaned keys in en.json/af.json, all new keys used
5. **CLAUDE.md update:** Update API docs for the new `total_litres` field
6. **MEMORY.md update:** Record Phase 9A completion status
7. **Full test pass:** `cd client && npm run test:run` — all green

**Acceptance criteria:**
- `knip` reports no new dead code
- No cascading/duplicate API calls on user actions
- Backend does at most 2 queries for paginated list (count+sum, data)
- All tests pass, CLAUDE.md and MEMORY.md up to date

---

## Summary

| Task | Complexity | Backend | Frontend | Tests | Verify |
|------|-----------|---------|----------|-------|--------|
| 9A.1 total_litres | S | x | | x | x |
| 9A.2 Pagination | M | | x | | x |
| 9A.3 Cow search | M | | x | | x |
| 9A.4 Date range | M | | x | | x |
| 9A.5 Styling | S | | x | | x |
| 9A.6 Tests | M | | | x | x |
| 9A.7 Final review | S | x | x | x | x |

**Total:** 1 backend change, 4 frontend tasks, 1 test task, 1 final review
**Files touched:** 5 core (milkRecords.js route, MilkHistoryView.vue, en.json, af.json, MilkHistoryView.test.js) + CLAUDE.md, MEMORY.md
