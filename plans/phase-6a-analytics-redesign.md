# Analytics Redesign — Sub-Plan

> Sub-plan for PLAN.md Phase 6A rewrite

## Context

The current analytics page is a single monolithic scroll with 8 chart sections. For a 100-cow farmer, this lacks focus — they can't quickly find the KPIs that matter for a specific decision (financial, fertility, health, or herd planning). The redesign splits analytics into a daily KPI landing page with 4 category sub-pages, each accessible via its own route.

**User decisions:**
- Separate routes per category (not tabs)
- Milk price per litre stored in app_settings (admin configurable)
- Daily landing shows today's numbers + 7-day trend comparison

## Existing Endpoints to Redistribute (not duplicate)

| Endpoint | Moves to |
|----------|----------|
| `herd-summary` | Landing (stays) + Structure (reused) |
| `unhealthiest` | Health |
| `milk-trends` | Financial |
| `top-producers` | Financial |
| `wasted-milk` | Financial |
| `breeding-overview` | Fertility |
| `treatment-costs` | Financial + Health (reused) |
| `seasonal-prediction` | Health |

---

## Phase 1: Route Restructure + Landing Page

### 1.1 Backend — new endpoint
**File:** `server/routes/analytics.js`

`GET /api/analytics/daily-kpis` — returns:
```json
{
  "litres_today": 245.5,
  "litres_7day_avg": 230.2,
  "cows_milked_today": 42,
  "cows_expected": 48,
  "active_health_issues": 3,
  "breeding_actions_due": 2
}
```
Queries: SUM(litres) today, SUM(litres)/7 for last 7 days, COUNT(DISTINCT cow_id) today, COUNT active milkable females, COUNT health_issues where status IN ('open','treating'), COUNT upcoming breeding events due today or overdue (not dismissed).

### 1.2 Frontend — rewrite AnalyticsView.vue
Replace monolithic chart page with:
- 4 KPI stat chips at top (litres today, cows milked, active issues, breeding due) — each shows today vs comparison (7-day avg or expected)
- 4 category navigation buttons below: Financial, Fertility, Herd Health, Herd Structure
- Offline banner (reuse existing pattern)
- Feature flag gating: hide KPI cards when their module flag is off

### 1.3 Create 4 stub category views
**New files:**
- `client/src/views/analytics/FinancialView.vue`
- `client/src/views/analytics/FertilityView.vue`
- `client/src/views/analytics/HealthView.vue`
- `client/src/views/analytics/StructureView.vue`

Each stub: AppHeader with `show-back back-to="/analytics"`, "Coming soon" empty state.

### 1.4 Router — add sub-routes
**File:** `client/src/router/index.js`

Add 4 routes before catch-all: `/analytics/financial`, `/analytics/fertility`, `/analytics/health`, `/analytics/structure`. All with `meta: { requiresAuth: true, requiresModule: 'analytics' }`.

### 1.5 i18n — landing + category nav keys (en + af)

### 1.6 Shared utilities
- `client/src/composables/useAnalytics.js` — extract `handleError`, `offline`, `flags`, `formatMonth`, chart color palette, common chart options
- `client/src/utils/chartSetup.js` — one-time Chart.js component registration (prevents duplicate registration across views)

### 1.7 Tests
- **Server:** daily-kpis endpoint (correct shape, counts today's milk, returns 0s with no data)
- **Client:** Rewrite `AnalyticsView.test.js` for landing page (KPI cards, category buttons, flag gating, offline banner)

### 1.8 Code review
- Remove all old chart sections, chart data computeds, per-section loading states from AnalyticsView
- Verify no dead imports remain
- Existing 7 backend endpoints stay intact (consumed by category pages)

---

## Phase 2: Financial Category

### 2.1 Backend — milk price setting
**File:** `server/routes/appSettings.js`
Add `'milk_price_per_litre'` to `VALID_KEYS` array (line 12). No migration needed.

### 2.2 Backend — new endpoints
**File:** `server/routes/analytics.js`

`GET /api/analytics/litres-per-cow` — monthly avg litres per cow per day (12 months)
```json
{ "months": [{ "month": "2025-03", "avg_litres_per_cow_per_day": 18.5, "cow_count": 45 }] }
```

`GET /api/analytics/bottom-producers` — bottom 10 cows by avg daily litres (last 90 days). Mirror of top-producers, ordered ASC.

### 2.3 Frontend — milk price in SettingsView
**File:** `client/src/views/admin/SettingsView.vue`
Add milk price input row to app settings section.

### 2.4 Frontend — FinancialView.vue (full implementation)
Sections:
1. **Litres per Cow per Day** — Line chart (litres-per-cow endpoint)
2. **Revenue per Month** — Bar chart (milk-trends × milk_price from settings)
3. **Treatment Cost per Cow** — Bar chart (treatment-costs ÷ herd size)
4. **Wasted Milk Value** — Bar chart (wasted-milk × milk_price)
5. **Top Producers** — Horizontal bar + list (existing top-producers)
6. **Bottom Producers** — Horizontal bar + list (new bottom-producers)

Fetches milk_price from `GET /api/settings` (public). Shows "set milk price in Settings" message when not configured.

### 2.5 i18n (en + af)

### 2.6 Tests
- **Server:** litres-per-cow, bottom-producers endpoints + milk_price setting validation
- **Client:** `tests/analytics/FinancialView.test.js` — charts render, flag gating, milk price messaging, offline

### 2.7 Code review
- Verify AnalyticsView has no remnant milk/treatment chart code
- Check FinancialView reuses `useAnalytics` composable properly

---

## Phase 3: Fertility Category

### 3.1 Backend — new endpoints
**File:** `server/routes/analytics.js`

`GET /api/analytics/calving-interval` — avg days between successive calvings per cow
```json
{ "avg_calving_interval_days": 385, "cow_count": 12, "intervals": [{ "cow_id", "tag_number", "name", "interval_days", "calving_count" }] }
```
Logic: Find cows with 2+ calving events, calculate day gaps between consecutive calvings, average.

`GET /api/analytics/days-open` — avg days from calving to next confirmed pregnancy
```json
{ "avg_days_open": 95, "cow_count": 8, "records": [{ "cow_id", "tag_number", "days_open" }] }
```
Logic: For each cow, find (calving → next preg_check_positive) pairs. Last 24 months.

`GET /api/analytics/conception-rate` — first-service conception rate
```json
{ "first_service_rate": 45.5, "total_first_services": 22, "first_service_conceptions": 10 }
```
Logic: In last 12 months, for each preg_check_positive, check if only 1 insemination/bull_service occurred since last calving/abortion. Count first-service successes vs total.

### 3.2 Frontend — FertilityView.vue (full implementation)
Sections:
1. **Stat Chips** — Pregnant, Open, First-service rate %, Avg services/conception
2. **Calving Interval** — Bar chart per cow + average line
3. **Days Open** — Bar chart per cow + average line
4. **Expected Calvings** — Bar chart by month (from breeding-overview)

Gated by `breeding` flag.

### 3.3 i18n (en + af)

### 3.4 Tests
- **Server:** calving-interval (2+ calvings, single calving excluded), days-open, conception-rate
- **Client:** `tests/analytics/FertilityView.test.js` — stat chips, charts, empty states, flag gating, offline

### 3.5 Code review
- Verify no duplicate breeding-overview API calls across pages
- Check fertility queries are efficient (avoid N+1)

---

## Phase 4: Herd Health Category

### 4.1 Backend — new endpoints
**File:** `server/routes/analytics.js`

`GET /api/analytics/issue-frequency?from&to` — issue count by type + trend by month
```json
{ "by_type": [{ "code", "name", "emoji", "count" }], "by_month": [{ "month", "counts": { "mastitis": 3 } }] }
```

`GET /api/analytics/mastitis-rate?from&to` — cases per 100 cows per month
```json
{ "months": [{ "month", "rate", "cases", "herd_size" }], "avg_rate": 3.8 }
```

`GET /api/analytics/withdrawal-days?from&to` — withdrawal days lost per month
```json
{ "months": [{ "month", "total_withdrawal_days", "cows_affected" }], "grand_total_days": 180 }
```

### 4.2 Frontend — HealthView.vue (full implementation)
Sections:
1. **Stat Chips** — Open issues, Treating, Avg mastitis rate
2. **Issue Frequency by Type** — Horizontal bar chart
3. **Issue Trend by Month** — Stacked/grouped bar chart
4. **Mastitis Incidence Rate** — Line chart
5. **Withdrawal Days Lost** — Bar chart
6. **Treatment Costs** — Bar chart (reuse treatment-costs endpoint)
7. **Unhealthiest Cows** — List (reuse unhealthiest endpoint)
8. **Seasonal Predictions** — Cards (reuse seasonal-prediction endpoint)

Flag gating: issue sections require `healthIssues`, treatment/withdrawal require `treatments`.

### 4.3 i18n (en + af)

### 4.4 Tests
- **Server:** issue-frequency, mastitis-rate, withdrawal-days + date range filtering
- **Client:** `tests/analytics/HealthView.test.js` — charts, stat chips, flag gating, offline

### 4.5 Code review
- Verify issue_types JSON parsing is consistent with existing patterns
- Check for N+1 query issues in issue-frequency

---

## Phase 5: Herd Structure Category

### 5.1 Backend — new endpoints
**File:** `server/routes/analytics.js`

`GET /api/analytics/age-distribution` — count by age bracket
```json
{ "brackets": [{ "label": "0-1yr", "count": 5 }, ...], "total": 52 }
```
Brackets: 0-1yr, 1-2yr, 2-5yr, 5-8yr, 8+yr, unknown (null dob). Exclude sold/dead.

`GET /api/analytics/breed-composition` — count by breed type
```json
{ "breeds": [{ "name": "Holstein", "code": "holstein", "count": 30 }, { "name": "Unassigned", "code": null, "count": 5 }], "total": 52 }
```

`GET /api/analytics/mortality-rate?from&to` — sold + dead as % of herd per month
```json
{ "months": [{ "month", "sold", "dead", "rate_pct" }], "total_lost": 5, "avg_rate_pct": 1.2 }
```
Uses `updated_at` as proxy for when status changed. Default 12 months.

`GET /api/analytics/herd-size-trend?from&to` — herd size over time
```json
{ "months": [{ "month", "total", "active", "pregnant", "dry" }] }
```
Running total from created_at/updated_at. Pragmatic approach given no status changelog.

### 5.2 Frontend — StructureView.vue (full implementation)
Sections:
1. **Stat Chips** — Total herd, Males, Females, Avg age
2. **Age Distribution** — Bar chart
3. **Breed Composition** — Doughnut chart (register `ArcElement` from Chart.js)
4. **Mortality/Cull Rate** — Line chart
5. **Herd Size Trend** — Area line chart

No module-specific flags needed (structural data is always available).

### 5.3 i18n (en + af)

### 5.4 Tests
- **Server:** age-distribution (excludes deleted, handles null dob), breed-composition, mortality-rate, herd-size-trend
- **Client:** `tests/analytics/StructureView.test.js` — stat chips, charts, empty states, offline

### 5.5 Final cleanup
- Run `npm run knip` for dead code
- Verify DashboardView still works independently (herd-summary)
- Update CLAUDE.md API docs with all new endpoints
- Update MEMORY.md phase status

---

## File Impact Summary

| Phase | Modified | New |
|-------|----------|-----|
| 1 | analytics.js (route), AnalyticsView.vue, router, i18n×2, tests×2 | 4 stub views, useAnalytics.js, chartSetup.js |
| 2 | appSettings.js, analytics.js, SettingsView.vue, i18n×2, tests | FinancialView.vue (replace stub), FinancialView.test.js |
| 3 | analytics.js, i18n×2, tests | FertilityView.vue (replace stub), FertilityView.test.js |
| 4 | analytics.js, i18n×2, tests | HealthView.vue (replace stub), HealthView.test.js |
| 5 | analytics.js, i18n×2, tests, CLAUDE.md, MEMORY.md | StructureView.vue (replace stub), StructureView.test.js |

**Total new endpoints:** 12 (daily-kpis, litres-per-cow, bottom-producers, calving-interval, days-open, conception-rate, issue-frequency, mastitis-rate, withdrawal-days, age-distribution, breed-composition, mortality-rate, herd-size-trend)

## Verification

After each phase:
1. `cd client && npm run test:run` — all tests pass
2. `npm run dev` — manual check: navigate to analytics, click category, verify charts render
3. Code review: dead code, efficiency, refactoring opportunities
4. i18n: verify both en and af have all new keys

Final verification:
- `npm run knip` — no dead exports
- `npm run lint` — no new warnings
- Full walkthrough: Dashboard → Analytics → each category → back navigation
