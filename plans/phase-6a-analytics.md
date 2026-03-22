# Phase 6A: Analytics Charts — Implementation Plan

## Context

The analytics view currently shows a herd status bar chart and an "unhealthiest cows" section (backend returns empty array — placeholder). The dashboard has quick-action cards but no inline alert summaries (keeping it that way per design decision). This phase builds out the full analytics API and enhances the analytics view with chart.js charts. PDF/Excel report exports are deferred to a future Phase 6B.

## Design Decisions

- **Chart library**: chart.js + vue-chartjs — lightweight, good Vue 3 integration
- **Dashboard**: No changes — keep current quick-action grid. Analytics accessible via existing dashboard card.
- **Analytics sections**: Each section is a card with a chart or ranked list. Sections are feature-flag gated (milk charts hidden if milkRecording disabled, breeding charts hidden if breeding disabled, etc.)
- **Date range**: Analytics endpoints accept optional `from`/`to` query params for filtering. Default to last 12 months.
- **Offline**: Analytics are online-only — no IndexedDB caching. Show "offline" empty state if API fails with network error.
- **Seasonal predictor**: Simple pattern — group historical issues by calendar month + type, show top predicted issues for the next 2 months.

## Quality Gate (run after EVERY sub-phase)

Every sub-phase ends with a mandatory quality gate before moving on. Do NOT skip any step.

1. **Tests**: Write tests for all new code (routes, views, components). Run `cd client && npm run test:run` — all tests must pass.
2. **Lint**: Run `npm run lint:fix` — zero errors (warnings from pre-existing baseline are acceptable).
3. **Dead code scan**: Run `npm run knip` — no new unused exports, files, or dependencies.
4. **Self-review for refactor opportunities**:
   - Scan all new AND touched files for: duplicated logic that should be extracted, overly complex functions that should be split, inconsistent patterns vs the rest of the codebase, inefficient DB queries (N+1, missing indexes, redundant joins).
   - Check that new code follows conventions in MEMORY.md (section dividers, Joi schema placement, back buttons, etc.)
5. **Surprise check**: If anything unexpected is discovered during implementation (schema inconsistencies, broken existing code, missing data, security concerns, performance issues), **stop and notify the user** before proceeding. Do not silently work around surprises.
6. **i18n completeness**: Verify every new user-facing string has keys in BOTH `en.json` and `af.json`.

---

## SUB-PHASE 6A.1: Analytics API Endpoints

### Step 6A.1.1 — Fix unhealthiest cows endpoint

- **Edit** `server/routes/analytics.js` — `GET /api/analytics/unhealthiest`
- Query `health_issues` joined with `cows`: group by `cow_id`, count issues in last 90 days, order by count DESC, limit 10
- Return array of `{ id, tag_number, name, sex, issue_count }`

### Step 6A.1.2 — Milk production trends

- **Add** `GET /api/analytics/milk-trends` to `analytics.js`
- Query `milk_records`: group by month (`recording_date`), SUM litres, COUNT records
- Accepts `?from=YYYY-MM-DD&to=YYYY-MM-DD` (default last 12 months)
- Returns `{ months: [{ month: 'YYYY-MM', total_litres, record_count, avg_per_cow }] }`

### Step 6A.1.3 — Top performing cows

- **Add** `GET /api/analytics/top-producers` to `analytics.js`
- Query `milk_records` joined with `cows`: group by cow_id, AVG daily litres over last 90 days, order DESC, limit 10
- Returns array of `{ id, tag_number, name, avg_daily_litres, total_litres, days_recorded }`

### Step 6A.1.4 — Wasted milk (withdrawal discards)

- **Add** `GET /api/analytics/wasted-milk` to `analytics.js`
- Query `milk_records` where `milk_discarded = true`: group by month, SUM litres
- Accepts `?from&to` date range
- Returns `{ months: [{ month: 'YYYY-MM', discarded_litres, discard_count }], total_discarded }`

### Step 6A.1.5 — Breeding overview

- **Add** `GET /api/analytics/breeding-overview` to `analytics.js`
- Queries:
  - Count cows with status `pregnant` (or latest breeding event = preg_check_positive without calving)
  - Count "open" cows (active females, not pregnant)
  - Expected calvings per month (from `expected_calving` dates in breeding_events, next 6 months)
  - Services per conception — avg breeding events before preg_check_positive (last 12 months)
- Returns `{ pregnant_count, open_count, calvings_by_month: [{ month, count }], avg_services_per_conception }`

### Step 6A.1.6 — Treatment costs

- **Add** `GET /api/analytics/treatment-costs` to `analytics.js`
- Query `treatments`: group by month (`treatment_date`), SUM cost, COUNT treatments
- Accepts `?from&to` date range
- Returns `{ months: [{ month: 'YYYY-MM', total_cost, treatment_count }], grand_total }`

### Step 6A.1.7 — Seasonal issue predictor

- **Add** `GET /api/analytics/seasonal-prediction` to `analytics.js`
- Query `health_issues`: group by calendar month (1-12) + `issue_type`, count occurrences across ALL years
- For the upcoming 2 calendar months, return top 3 issue types by historical frequency
- Returns `{ predictions: [{ month: 'YYYY-MM', month_name: 'March', issues: [{ type, code, historical_avg, severity_mode }] }] }`

### Verification

- All 7 endpoints return valid data against seed database
- Date range filtering works on milk-trends, wasted-milk, treatment-costs
- Unhealthiest returns actual cows with issue counts (no longer empty)

### Step 6A.1.8 — Quality Gate

- Write tests for all 7 analytics endpoints (verify correct data shapes, date filtering, empty states)
- Run full Quality Gate checklist (see above)

---

## SUB-PHASE 6A.2: Install Chart.js + Vue-ChartJS

### Step 6A.2.1 — Install dependencies

- `cd client && npm install chart.js vue-chartjs`
- No global registration needed — import per-component

---

## SUB-PHASE 6A.3: Enhanced Analytics View

### Step 6A.3.1 — Refactor AnalyticsView layout

- **Edit** `client/src/views/AnalyticsView.vue`
- Add tab navigation or scrollable sections for each analytics category
- Each section loads its own data on mount (parallel API calls)
- Feature-flag gate sections: milk sections need `flags.milkRecording`, breeding needs `flags.breeding`, treatments needs `flags.treatments`, health needs `flags.healthIssues`
- Offline-aware: show "Connect to view analytics" empty state on network error

### Step 6A.3.2 — Herd Status section (existing — keep)

- Already works. No changes needed.

### Step 6A.3.3 — Unhealthiest Cows section (existing — will now show data)

- Already wired to `GET /api/analytics/unhealthiest` — will show real data once endpoint is fixed (step 6A.1.1)

### Step 6A.3.4 — Milk Production Trends chart

- **Add section** to AnalyticsView (gated by `flags.milkRecording`)
- Line chart (vue-chartjs `<Line>`) showing monthly total litres over last 12 months
- X-axis: months, Y-axis: litres
- Subtitle: "Total: {sum} litres"

### Step 6A.3.5 — Top Producers list

- **Add section** (gated by `flags.milkRecording`)
- Ranked list (1-10) with tag number, cow name, avg daily litres
- Tappable rows → navigate to cow detail
- Bar chart showing relative production

### Step 6A.3.6 — Wasted Milk chart

- **Add section** (gated by `flags.milkRecording` + `flags.treatments`)
- Bar chart showing monthly discarded litres
- Subtitle: "Total discarded: {sum} litres"

### Step 6A.3.7 — Breeding Overview section

- **Add section** (gated by `flags.breeding`)
- Stat chips: Pregnant count, Open count, Avg services/conception
- Bar chart: expected calvings per month (next 6 months)

### Step 6A.3.8 — Treatment Costs chart

- **Add section** (gated by `flags.treatments`)
- Bar chart showing monthly treatment spend
- Subtitle: "Total spend: R{sum}"

### Step 6A.3.9 — Seasonal Issue Predictor

- **Add section** (gated by `flags.healthIssues`)
- Card per upcoming month showing top 3 predicted issue types with emojis (from issueTypesStore) and historical average count
- "Based on {N} years of data" subtitle

### Step 6A.3.10 — i18n keys

- Add keys for all new section titles, labels, empty states in both `en.json` and `af.json`
- Namespace: `analytics.*` (e.g., `analytics.milkTrends`, `analytics.topProducers`, `analytics.wastedMilk`, `analytics.breedingOverview`, `analytics.treatmentCosts`, `analytics.seasonalPrediction`, `analytics.totalLitres`, `analytics.avgDaily`, `analytics.discardedLitres`, `analytics.pregnantCount`, `analytics.openCount`, `analytics.servicesPerConception`, `analytics.totalSpend`, `analytics.predictedIssues`, `analytics.basedOnYears`, `analytics.connectToView`)

### Verification

- All chart sections render with seed data
- Feature-flag gating works (disable milkRecording → milk sections hidden)
- Offline shows graceful empty state
- Charts are responsive on mobile and desktop
- Tapping top producer cow navigates to cow detail

### Step 6A.3.11 — Quality Gate

- Write component tests for AnalyticsView (verify sections render, feature-flag gating, offline empty state)
- Run full Quality Gate checklist (see above)
- **Final Phase 6A sweep**: Review ALL files created/modified across the entire phase for cross-cutting concerns (consistent error handling, shared chart config/styles, unnecessary duplication between chart sections)
