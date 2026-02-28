# Breeding Events Advanced Filters — Implementation Plan

## Context

The BreedingEventsView (`/breed/events`) currently has event-type filter chips and server-side pagination with a PaginationBar. We want to add an "Advanced Filters" collapsible section following the same visual pattern as CowListView, with breeding-event-relevant filters. The backend GET `/api/breeding-events` needs new query params to support these filters.

## Design Decisions

- **No shared component extraction** — the filter groups are domain-specific per page. We reuse the same CSS class names/patterns (`.advanced-toggle`, `.advanced-filters`, `.filter-group`, etc.) for visual consistency.
- **Server-side filtering** — all new filters become query params on `GET /api/breeding-events` so pagination counts stay correct.
- **Existing event-type chips stay** as the top-level quick filter (unchanged).

## Filters to Add

| Group | Filter | UI | Query Param |
|-------|--------|----|-------------|
| **Cow** | Cow search | `CowSearchDropdown` molecule | `cow_id` (already supported) |
| **Cow** | Cow status | Chips: All / Active / Pregnant / Dry | `cow_status` (new) |
| **Date** | Event date range | Two date inputs (from–to) | `date_from`, `date_to` (new) |
| **Event** | Outcome (preg check) | Chips: All / Positive / Negative | Already handled by event_type filter chips |

> Note: The event-type chips already cover outcome filtering (preg_check_positive vs preg_check_negative are separate types). No extra filter needed.

---

## PHASE 1: Backend — New Query Params

### Step 1.1 — Add `cow_status`, `date_from`, `date_to` params to GET /

**File:** `server/routes/breedingEvents.js`

In the paginated branch (non-cow_id path) of `GET /`:

1. Parse new query params:
   ```js
   const { cow_id, event_type, cow_status, date_from, date_to } = req.query
   ```

2. Add a `applyFilters(query)` helper (or extend existing pattern):
   - `cow_status` → `.where('c.status', cow_status)` — validate against known statuses
   - For `cow_status = 'dry'` → `.where('c.is_dry', true)` (dry isn't a status, it's a flag)
   - `date_from` → `.where('be.event_date', '>=', date_from)`
   - `date_to` → `.where('be.event_date', '<=', date_to)`

3. Apply the helper to both the data query and count query (same as `applyTypeFilter` pattern).

4. Also apply to the per-cow (cow_id) path so date range works there too.

### Step 1.2 — Validate new params with Joi or inline checks

- `cow_status`: validate against `['active', 'pregnant', 'dry']` — return 400 if invalid
- `date_from` / `date_to`: validate ISO date format

---

## PHASE 2: Frontend — Advanced Filters UI

### Step 2.1 — Add state variables

**File:** `client/src/views/BreedingEventsView.vue`

Add refs:
```js
const showAdvanced = ref(false)
const cowFilter = ref(null)       // cow_id from CowSearchDropdown
const cowStatusFilter = ref('')   // '' | 'active' | 'pregnant' | 'dry'
const dateFrom = ref('')
const dateTo = ref('')
```

Add computed `advancedFilterCount` — count of non-empty advanced filters (for the badge).

### Step 2.2 — Add advanced filters template

After the existing filter chips, before the loading state:

```html
<!-- Advanced filters toggle -->
<button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
  {{ t('breeding.advancedFilters') }}
  <span v-if="advancedFilterCount > 0" class="filter-badge">{{ advancedFilterCount }}</span>
  <span class="toggle-arrow" :class="{ open: showAdvanced }">▾</span>
</button>

<div v-if="showAdvanced" class="advanced-filters">
  <!-- Cow group -->
  <div class="filter-group">
    <span class="filter-group-title">{{ t('breeding.filterGroupCow') }}</span>
    <CowSearchDropdown v-model="cowFilter" @update:model-value="onAdvancedChange" />
    <div class="filter-chips filter-chips-wrap">
      <button class="chip" :class="{ active: cowStatusFilter === '' }" @click="setCowStatusFilter('')">{{ t('cows.filterAll') }}</button>
      <button class="chip" :class="{ active: cowStatusFilter === 'active' }" @click="setCowStatusFilter('active')">{{ t('status.active') }}</button>
      <button class="chip" :class="{ active: cowStatusFilter === 'pregnant' }" @click="setCowStatusFilter('pregnant')">{{ t('status.pregnant') }}</button>
      <button class="chip" :class="{ active: cowStatusFilter === 'dry' }" @click="setCowStatusFilter('dry')">{{ t('breeding.filterDry') }}</button>
    </div>
  </div>

  <div class="filter-divider" />

  <!-- Date group -->
  <div class="filter-group">
    <span class="filter-group-title">{{ t('breeding.filterGroupDate') }}</span>
    <div class="filter-range-row">
      <span class="filter-label">{{ t('breeding.filterEventDate') }}</span>
      <div class="filter-range-inputs">
        <input v-model="dateFrom" type="date" class="form-input filter-date-input" @change="onAdvancedChange" />
        <span class="filter-sep">–</span>
        <input v-model="dateTo" type="date" class="form-input filter-date-input" @change="onAdvancedChange" />
      </div>
    </div>
  </div>
</div>
```

### Step 2.3 — Wire up fetchEvents to include new params

Update `fetchEvents()`:
```js
function fetchEvents() {
  const params = { page: page.value, limit: limit.value }
  if (eventFilter.value) params.event_type = eventFilter.value
  if (cowFilter.value) params.cow_id = cowFilter.value
  if (cowStatusFilter.value) params.cow_status = cowStatusFilter.value
  if (dateFrom.value) params.date_from = dateFrom.value
  if (dateTo.value) params.date_to = dateTo.value
  breedingStore.fetchAll(params)
}
```

Add helper functions:
```js
function setCowStatusFilter(val) {
  cowStatusFilter.value = val
  page.value = 1
  fetchEvents()
}

function onAdvancedChange() {
  page.value = 1
  fetchEvents()
}
```

### Step 2.4 — Copy scoped CSS from CowListView

Copy these class definitions into the `<style scoped>` block (they're view-scoped, so must be duplicated):
- `.advanced-toggle`, `.toggle-arrow`, `.toggle-arrow.open`
- `.filter-badge`
- `.advanced-filters`
- `.filter-group`, `.filter-group:last-child`, `.filter-group-title`
- `.filter-divider`
- `.filter-chips-wrap`
- `.filter-range-row`, `.filter-range-inputs`, `.filter-label`, `.filter-sep`
- `.filter-date-input` (if not already global)

---

## PHASE 3: i18n Keys

### Step 3.1 — Add keys to both locale files

**Files:** `client/src/i18n/en.json`, `client/src/i18n/af.json`

Keys to add under `breeding`:
```
breeding.advancedFilters     — "Advanced Filters" / "Gevorderde Filters"
breeding.filterGroupCow      — "Cow" / "Koei"
breeding.filterGroupDate     — "Date" / "Datum"
breeding.filterEventDate     — "Event Date" / "Gebeurtenis Datum"
breeding.filterDry           — "Dry" / "Droog"
```

---

## Summary

| Phase | Files Modified | Scope |
|-------|---------------|-------|
| 1 | `server/routes/breedingEvents.js` | Add cow_status, date_from, date_to query params |
| 2 | `client/src/views/BreedingEventsView.vue` | Advanced filter UI + wiring |
| 3 | `client/src/i18n/en.json`, `af.json` | New i18n keys |

No new files, no migrations, no store changes — the breedingEvents store's `fetchAll` already passes arbitrary params through to the API.
