# Demo Farm Seed Script

## Overview
Standalone script `server/seeds/demo_farm_seed.js` that creates a complete demo farm with 12 months of realistic dairy data. Run once via `node server/seeds/demo_farm_seed.js`.

## Safety
- Idempotent: checks if farm code `DEMO` exists, exits if so
- Insert-only: zero DELETE/UPDATE statements
- Full transaction: all-or-nothing
- Farm-scoped: everything tied to DEMO farm_id

## Data Spec
| Table | ~Rows | Notes |
|---|---|---|
| farm | 1 | "Demo" / code DEMO |
| users | 2 | demo/demo123 (admin) + melker/1234 (worker PIN) |
| breed_types | 1 | Ayrshire only |
| issue_types | 9 | Standard set from farmSeedService fallbacks |
| medications | 5 | Standard set from farmSeedService fallbacks |
| feature_flags | 5 | All enabled |
| app_settings | 2 | farm_name + default_language=af |
| cows | ~100 | Realistic lifecycle spread |
| milk_records | ~30K | 12 months, 2 sessions/day for milking cows |
| health_issues | ~200-400 | Seasonal distribution |
| treatments | ~200-350 | Linked to health issues |
| treatment_medications | ~250-400 | Primary + extra meds |
| breeding_events | ~300-500 | Full cycles |

## Cow Distribution (~100)
| Category | Count | Status | is_dry |
|---|---|---|---|
| Milking | 45 | active | false |
| Pregnant | 15 | pregnant | false |
| Dry | 8 | active | true |
| Heifers (unbred) | 10 | active | false |
| Heifers (bred) | 5 | active | false |
| Calves | 8 | active | false |
| Bulls | 3 | active | false |
| Sold | 4 | sold | false |
| Dead | 2 | dead | false |

## Status: IN PROGRESS
