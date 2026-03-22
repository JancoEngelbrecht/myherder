# Breeding Hub Pagination Sub-Plan

## Goal

Add server-side pagination to the Recent Events list in `BreedingHubView.vue`, matching the `CowListView` PaginationBar pattern. Add a collapsible "show more" pattern for upcoming alert categories to prevent unbounded growth on large herds.

## Pattern References

- Backend pagination: `server/routes/cows.js` (page/limit/offset + total count)
- Frontend pagination: `client/src/views/CowListView.vue` + `client/src/components/atoms/PaginationBar.vue`
- Store pattern: `client/src/stores/cows.js` (total ref, fetchAll with params)

---

## Step 1 — Backend: Add pagination to `GET /api/breeding-events`

**File:** `server/routes/breedingEvents.js`

- Accept `page` and `limit` query params (default: page=1, limit=20)
- When `cow_id` is provided, skip pagination and return a plain array (per-cow repro views don't need it — there are never hundreds of events per cow)
- When no `cow_id`, return `{ data: [...], total: N }` instead of a plain array
- Use `offset = (page - 1) * limit` for the DB query
- Run two queries in parallel: the paginated data query + a `count(*)` query with same filters but no limit/offset
- Cap `limit` at 100 to prevent abuse
- Keep `event_type` filter working alongside pagination

**Response shape change:**

- Before: `GET /api/breeding-events` → `[...events]`
- After: `GET /api/breeding-events` (no cow_id) → `{ data: [...events], total: N }`
- Unchanged: `GET /api/breeding-events?cow_id=X` → `[...events]` (plain array, same as before)

**Update CLAUDE.md** API docs to reflect new response format.

---

## Step 2 — Store: Add `total` ref and handle paginated response

**File:** `client/src/stores/breedingEvents.js`

- Add `const total = ref(0)`
- In `fetchAll()`:
  - If `filters.cow_id` is present: response is a plain array — keep existing behavior, don't touch `total`
  - Otherwise: response is `{ data, total }` — set `events.value = res.data.data`, `total.value = res.data.total`
- Expose `total` from the store's return object
- `fetchForCow()` already calls `fetchAll({ cow_id })` — no changes needed there

---

## Step 3 — View: Wire up PaginationBar on Recent Events

**File:** `client/src/views/BreedingHubView.vue`

- Import `PaginationBar` from `../components/atoms/PaginationBar.vue`
- Add `page = ref(1)` and `limit = ref(20)` reactive state
- Add `onPageChange(p)` and `onLimitChange(l)` handlers (reset to page 1 on limit change and on filter chip change)
- In `onMounted`: call `breedingStore.fetchAll({ page: 1, limit: 20 })` (already passes limit; add page)
- Replace the `filteredEvents` computed: remove the hardcoded `slice(0, 50)` / `slice(0, 20)` guards — let server handle it. Filter by event type client-side across the current page only (server already limits records).
- Place `<PaginationBar>` below the events list, bound to `breedingStore.total`, `page`, `limit`
- On event type filter chip click: reset `page.value = 1` then re-fetch

**Important:** The filter chips currently filter client-side across a hard-sliced set. With server pagination, filter chips should trigger a new server fetch with the `event_type` param rather than filtering client-side. This gives accurate counts across all pages.

Updated filter chip logic:

- `eventFilter` ref stays, but clicking a chip calls `fetchEvents()` (new helper) instead of just setting the ref
- `fetchEvents()` calls `breedingStore.fetchAll({ page: page.value, limit: limit.value, event_type: eventFilter.value || undefined })`
- `filteredEvents` computed just returns `breedingStore.events` directly (no client-side slicing)

---

## Step 4 — View: Collapsible upcoming alert categories

**File:** `client/src/views/BreedingHubView.vue`

For the Upcoming Alerts section (heats, calvings, pregChecks, dryOffs), these are deduplicated per cow so they're naturally bounded, but can still be long on large herds.

- Add a `ALERT_PREVIEW_COUNT = 5` constant
- For each category, compute a `visible` slice: show first 5 by default
- Add a `showAllAlerts = reactive({ heats: false, calvings: false, pregChecks: false, dryOffs: false })` ref
- Below each category list, if total count > 5, show a small text button: "Show all (N)" / "Show less"
- No backend changes — data is already fully loaded by `fetchUpcoming()`

**i18n keys to add** (both `en.json` and `af.json`):

- `breeding.showAll` → "Show all ({count})" / "Wys almal ({count})"
- `breeding.showLess` → "Show less" / "Wys minder"

---

## Step 5 — Update CLAUDE.md API docs

Update the breeding events API doc entry:

```
- `GET /api/breeding-events?cow_id=X` → plain array (unchanged)
- `GET /api/breeding-events?page=N&limit=N&event_type=X` → `{ data: [...], total: N }`
```

---

## Implementation Order

1. Step 1 — backend route (foundation for everything else)
2. Step 2 — store (depends on Step 1)
3. Step 3 — view pagination (depends on Steps 1 + 2)
4. Step 4 — view alert collapse (frontend only, independent)
5. Step 5 — CLAUDE.md docs update

---

## What Does NOT Change

- `GET /api/breeding-events/upcoming` — unchanged (already returns structured object, not paginated)
- `GET /api/breeding-events/:id` — unchanged
- `POST`, `PATCH`, `DELETE` routes — unchanged
- `fetchForCow()` / `CowReproView.vue` — unchanged (cow_id path stays plain array)
- `BreedingEventCard` component — unchanged
- `ConfirmDialog` usage for delete/dismiss — unchanged
- All i18n keys except the two new ones in Step 4
