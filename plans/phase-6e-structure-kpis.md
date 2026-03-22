# Phase 6E: Herd Structure Analytics Enhancement

**Status:** COMPLETE

## Overview

Redesign the Herd Structure dashboard to match the depth of the Fertility and Health dashboards. Replace basic stat chips (total/males/females/avg age) with actionable KPIs (milking count, dry count, heifers, replacement rate, turnover rate). Enhance existing charts (sex-split age distribution, stacked mortality bars) and add a new herd turnover chart and status breakdown doughnut.

**Current state:** 4 stat chips + 4 chart sections (age bar, breed doughnut, mortality line, herd trend line)
**Target state:** 7 stat chips + 6 chart sections with richer data, benchmark annotations, and conditional coloring

---

## Phase 1: Backend (1 new endpoint + 2 enhanced)

### 1.1 Enhance `herd-summary` endpoint

**File:** `server/routes/analytics.js` — `GET /api/analytics/herd-summary`

Add fields to existing response (additive, non-breaking):

```json
{
  "total": 45,
  "by_status": [{ "status": "active", "count": 30 }, ...],
  "milking_count": 22,
  "dry_count": 5,
  "heifer_count": 8,
  "males": 10,
  "females": 35,
  "replacement_rate": 36.4
}
```

Logic:

- Query all non-deleted cows with `sex`, `status`, `is_dry` columns
- `milking_count`: females where status IN ('active', 'pregnant', 'sick') AND is_dry != 1
- `dry_count`: females where is_dry = 1 OR status = 'dry'
- `heifer_count`: females with zero calving events (LEFT JOIN breeding_events WHERE event_type = 'calving', grouped, HAVING count = 0). Exclude sold/dead
- `males` / `females`: count by sex
- `replacement_rate`: round2(heifer_count / milking_count \* 100), 0 if milking_count = 0

Update CLAUDE.md API docs for herd-summary.

### 1.2 New `herd-turnover` endpoint

**File:** `server/routes/analytics.js` — `GET /api/analytics/herd-turnover?from&to`

Monthly additions (cows created) vs removals (cows set to sold/dead):

```json
{
  "months": [{ "month": "2025-06", "additions": 3, "removals": 1, "net": 2 }],
  "total_additions": 12,
  "total_removals": 5
}
```

Logic:

- Additions: non-deleted cows grouped by `monthExpr('created_at')` within date range
- Removals: cows with status IN ('sold', 'dead') grouped by `monthExpr('updated_at')` within date range
- Merge into single month array, compute `net = additions - removals`
- Use `defaultRange()` for date params (12-month default)

Register in CLAUDE.md API docs.

### 1.3 Enhance `age-distribution` endpoint

**File:** `server/routes/analytics.js` — `GET /api/analytics/age-distribution`

Add `males`/`females` per bracket (additive, non-breaking):

```json
{
  "brackets": [
    { "label": "0-1yr", "count": 5, "males": 2, "females": 3 },
    { "label": "1-2yr", "count": 8, "males": 1, "females": 7 }
  ],
  "total": 45,
  "males": 10,
  "females": 35
}
```

Logic: Track `males` and `females` counters per bracket in the existing loop (already iterates over `row.sex`).

Update CLAUDE.md API docs for age-distribution.

### 1.4 Backend tests

**File:** `server/tests/analytics.test.js`

New/updated tests (~10):

- `herd-summary`: returns milking_count, dry_count, heifer_count, males, females, replacement_rate
- `herd-summary`: heifer detection (female with no calving events = heifer)
- `herd-summary`: excludes sold/dead from heifer count
- `herd-turnover`: returns months with additions, removals, net
- `herd-turnover`: respects date range filter
- `herd-turnover`: returns totals (total_additions, total_removals)
- `herd-turnover`: empty range returns empty months
- `age-distribution`: brackets include males/females split
- `age-distribution`: males/females per bracket sum to count

### 1.5 Quality Gate

- [ ] Run `cd server && npm test` — all tests pass
- [ ] Run `/simplify` on changed analytics.js code
  - Check for redundant DB queries (can herd-summary reuse a single cow fetch?)
  - Check heifer subquery efficiency (single LEFT JOIN vs N+1)
  - Verify `round2()` used on all percentages
- [ ] Run `npm run knip` — no dead exports
- [ ] Update CLAUDE.md API docs for all changed/new endpoints
- [ ] Remove any dead code from refactored endpoints

---

## Phase 2: Frontend (StructureView rewrite + i18n)

### 2.1 i18n keys (en + af)

**Files:** `client/src/i18n/en.json`, `client/src/i18n/af.json`

New keys under `analytics.structure`:

- `milkingCows`, `dryCows`, `heifers`, `replacementRate`, `turnoverRate`
- `statusBreakdown`, `statusBreakdownDesc`
- `ageDistributionDesc` (subtitle for sex-split explanation)
- `herdTurnover`, `herdTurnoverDesc`
- `additions`, `removals`, `net`
- `mortalityBenchmark` (annotation label)
- `totalAdditions`, `totalRemovals`

Remove dead keys (if males/females stat chips are replaced):

- Check if `males` and `females` keys are still used (they may be used in status doughnut legend)

### 2.2 StructureView.vue rewrite

**File:** `client/src/views/analytics/StructureView.vue`

#### Stat chips (7):

| #   | Chip             | Source                                         | Conditional color                    |
| --- | ---------------- | ---------------------------------------------- | ------------------------------------ |
| 1   | Total Herd       | herd-summary.total                             | —                                    |
| 2   | Milking Cows     | herd-summary.milking_count                     | —                                    |
| 3   | Dry Cows         | herd-summary.dry_count                         | —                                    |
| 4   | Heifers          | herd-summary.heifer_count                      | —                                    |
| 5   | Replacement Rate | herd-summary.replacement_rate + '%'            | `.warn` if < 25%, `.danger` if < 15% |
| 6   | Avg Age          | computed from age-distribution brackets        | —                                    |
| 7   | Turnover Rate    | computed: (total_removals / herd total) \* 100 | `.warn` if > 5%, `.danger` if > 8%   |

#### Chart sections (6):

**1. Status Breakdown** — Doughnut

- Data: herd-summary.by_status (snapshot, not time-sensitive)
- Colors: one per status (active=primary, dry=info, pregnant=purple, sick=warning, sold=muted, dead=danger)
- Legend: bottom position

**2. Age Distribution** — Stacked Bar (enhanced)

- Data: age-distribution brackets with males/females split (snapshot)
- Two datasets: males (info color) + females (primary color)
- Stacked: true on both x and y axes

**3. Breed Composition** — Doughnut (keep as-is)

- Data: breed-composition (snapshot)
- No changes needed

**4. Herd Turnover** — Grouped Bar (NEW)

- Data: herd-turnover months (time-sensitive)
- Two datasets: additions (primary) + removals (danger)
- Grouped (not stacked) for easy comparison
- Subtitle showing total additions / total removals

**5. Mortality & Cull Rate** — Stacked Bar (enhanced from line)

- Data: mortality-rate months (time-sensitive)
- Two datasets: sold (warning) + dead (danger), stacked
- Add horizontal annotation line at 2% for industry benchmark
- Keep total_lost subtitle

**6. Herd Size Trend** — Area Line (keep as-is)

- Data: herd-size-trend months (time-sensitive)
- No changes needed

#### Data fetching strategy:

- **On mount (snapshot):** herd-summary, age-distribution, breed-composition
- **On mount + time range change:** herd-turnover, mortality-rate, herd-size-trend
- Reuse `useTimeRange()` and `useAnalytics()` composables

### 2.3 Frontend tests

**File:** `client/src/tests/analytics/StructureView.test.js`

Rewrite tests (~14):

1. All 7 stat chips render with correct values
2. Replacement rate shows `.warn` class when < 25%
3. Replacement rate shows `.danger` class when < 15%
4. Turnover rate shows `.warn` class when > 5%
5. Status breakdown doughnut renders with by_status data
6. Age distribution stacked bar renders with sex split
7. Breed composition doughnut renders
8. Herd turnover grouped bar renders with additions/removals
9. Mortality stacked bar renders (sold + dead datasets)
10. Herd size trend line renders
11. Empty state when no data
12. Offline banner shown on network error
13. All 6 API calls made with correct endpoints
14. Time range change re-fetches turnover + mortality + trend (not snapshot endpoints)

### 2.4 Quality Gate

- [ ] Run `cd client && npm run test:run` — all tests pass (existing + new)
- [ ] Run `/simplify` on StructureView.vue
  - Check for duplicated chart option objects (extract to useAnalytics if reusable)
  - Check computed properties aren't doing unnecessary work
  - Verify conditional color logic is clean (no nested ternaries)
- [ ] Run `npm run lint` — no new warnings
- [ ] Run `npm run knip` — no dead code
- [ ] Check for dead i18n keys (removed stat chips, changed chart titles)
- [ ] Check analytics.css for any unused classes from old Structure layout
- [ ] Verify AnalyticsView landing page still links correctly to structure

---

## Totals (expected)

- 1 new backend endpoint (herd-turnover)
- 2 enhanced endpoints (herd-summary, age-distribution)
- ~10 backend tests
- ~14 frontend tests
- 2 i18n files updated (en + af)
- 1 view rewritten (StructureView.vue)
- CLAUDE.md updated (3 endpoint docs)
- MEMORY.md updated (phase status)
