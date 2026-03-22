# Phase 6D: Herd Health Analytics Enhancement

**Status:** COMPLETE

## Overview

Enhanced the `/analytics/health` page from 2 stat chips + mastitis-only incidence to 7 stat chips + dynamic top-3 disease tracking + 4 new chart sections. Removed mastitis-specific sections in favor of disease-agnostic analytics.

## Phase 1: Backend (5 new endpoints + shared helpers)

### Shared helpers extracted

- `getIssueTypeDefMap()` — fetches issue_type_definitions → `{ code: { code, name, emoji } }` map
- `parseIssueCodes(raw)` — safe JSON.parse for issue_types column
- `MS_PER_DAY` — module-level constant for day calculations

### New endpoints

| Endpoint                                               | Returns                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `GET /api/analytics/health-resolution-stats?from&to`   | Combined stat chips: cure_rate, avg_days_to_resolve, recurrence_rate, top_incidence[3] |
| `GET /api/analytics/health-resolution-by-type?from&to` | Avg resolution days per issue type code                                                |
| `GET /api/analytics/health-recurrence?from&to`         | Per-type recurrence rate (60-day window)                                               |
| `GET /api/analytics/health-cure-rate-trend?from&to`    | Monthly cure rate trend                                                                |
| `GET /api/analytics/slowest-to-resolve?from&to`        | Top 10 cows by avg resolution time                                                     |

### Refactored existing endpoints

- `issue-frequency` and `seasonal-prediction` now use shared helpers instead of inline parsing

### Tests

- 20 new backend tests (4 per endpoint: auth, shape, data verification, empty range)

## Phase 2: Frontend

### i18n keys added (en + af)

- `cureRate`, `avgDaysToResolve`, `recurrenceRate`, `topIncidence`, `topIncidenceDesc`
- `resolutionByType`, `resolutionByTypeDesc`, `cureRateTrend`, `cureRateTrendDesc`
- `recurrenceByType`, `recurrenceByTypeDesc`, `incidenceTrend`, `incidenceTrendDesc`
- `treatmentCostPerCow`, `treatmentCostPerCowDesc`, `slowestToResolve`, `slowestToResolveDesc`
- `daysAvg`, `target7d`, `target80pct`, `concern10pct`, `per100`, `costPerCowUnit`
- Removed dead keys: `avgMastitisRate`, `mastitisRate`, `mastitisRateDesc`, `withdrawalDays`, `withdrawalDaysDesc`

### CSS additions

- `.stat-value.warn` (amber), `.stat-value.danger` (red) for threshold coloring
- `.incidence-panel` + `.panel-label` for top-3 incidence sub-panel
- `.stat-chips-3col` for 3-column stat chip layout
- `.cow-days` for cow list day-count styling

### HealthView.vue rewrite (11 sections)

1. **Stat chips** (7): Open Issues, Cure Rate, Avg Days to Resolve, Recurrence Rate, top 3 incidence sub-panel
2. **Issue Frequency** — existing horizontal bar
3. **Issue Trend** — existing multi-line chart
4. **Resolution Time by Type** — horizontal bar with 7-day target annotation
5. **Cure Rate Trend** — line chart with 80% target annotation
6. **Recurrence by Type** — horizontal bar with 10% concern annotation
7. **Top 3 Disease Incidence Trend** — multi-line (cases per 100 cows/month)
8. **Treatment Cost per Cow** — bar with color-coded threshold
9. **Slowest to Resolve** — cow list (top 10)
10. **Unhealthiest Cows** — existing cow list
11. **Seasonal Predictions** — existing prediction cards

### Removed sections

- Mastitis Rate chart (replaced by disease-agnostic incidence)
- Withdrawal Days chart (low value, cluttered the view)

### Tests

- 17 new frontend tests covering all sections, stat chips, annotations, API calls, time range reactivity

## Phase 2 QG: /simplify fixes

- Extracted `MS_PER_DAY` to module level, removed 3 local declarations
- Fixed O(n²) recurrence scan with pre-parsed issue codes + cow_id index
- Used `60 * MS_PER_DAY` for recurrence window instead of inline magic number
- Fixed pre-existing `herd-size-trend` toISOString() timezone bug → `localDate()`
- Extracted `horizontalAnnotation()` and `verticalAnnotation()` helpers to `useAnalytics.js`, shared between HealthView and FertilityView
- Replaced hardcoded `'per 100'` and `'R / cow'` with i18n keys

## Totals

- 5 new backend endpoints
- 20 backend tests, 17 frontend tests
- 2 shared annotation helpers extracted to composable
- 2 i18n files updated (en + af)
