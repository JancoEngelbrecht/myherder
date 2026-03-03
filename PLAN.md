# Dairy Farm Management App — Final Project Plan

---

## Summary of Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Progressive Web App (PWA) | Works on PC + phone, offline-capable, one codebase |
| Frontend | Vue 3 (Composition API) + vue-i18n | Reactive, lightweight, bilingual EN/AF support |
| Backend | Node.js + Express | Same language as frontend, cPanel compatible |
| Database | MySQL via Knex.js ORM | cPanel standard, ORM makes it migration-proof |
| Auth | Self-managed, bcrypt + JWT | Appropriate for 4 private users, no external dependency |
| Offline | Service Worker + IndexedDB (Dexie.js) | Truly critical — workers often have no signal |
| Hosting | Single cPanel Node.js app | Serves both API and static Vue build |
| Language | English + Afrikaans (user-selectable) | Workers choose their preferred language |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    cPanel Server                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Node.js + Express                     │  │
│  │                                                    │  │
│  │  GET /              → serves Vue PWA (static)      │  │
│  │  GET /api/cows      → REST API                     │  │
│  │  POST /api/sync     → offline sync endpoint        │  │
│  │  POST /api/auth     → login/token                  │  │
│  │                                                    │  │
│  │  ┌──────────┐                                      │  │
│  │  │  MySQL   │  ← Knex.js ORM (migration-proof)    │  │
│  │  └──────────┘                                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────┐   ┌──────────────────────────┐
│   PC (Milking Parlor)    │   │   Phone (Field Worker)   │
│                          │   │                          │
│  Vue 3 PWA               │   │  Vue 3 PWA               │
│  ├── Service Worker       │   │  ├── Service Worker       │
│  ├── IndexedDB (offline)  │   │  ├── IndexedDB (offline)  │
│  └── Sync queue           │   │  └── Sync queue           │
│                          │   │                          │
│  Installed via browser    │   │  Installed via browser    │
│  Looks like native app    │   │  Looks like native app    │
└──────────────────────────┘   └──────────────────────────┘
```

### How Offline Sync Works

```
1. Worker logs data (no signal)
   → Saved to IndexedDB with a UUID + timestamp
   → Added to "sync queue" in IndexedDB
   → Worker sees confirmation immediately

2. Device gets signal (WiFi at farmhouse, etc.)
   → Service Worker detects connectivity
   → Reads sync queue from IndexedDB
   → POST /api/sync with all queued changes
   → Server processes each change with conflict resolution
   → Server responds with any changes from other devices
   → IndexedDB updated, sync queue cleared

3. Conflict Resolution (last write wins with safeguards)
   → Each record has an updated_at timestamp
   → If server version is newer, server wins
   → If client version is newer, client wins
   → Deletions are soft-deletes (never lose data)
```

**Key principle:** Every write goes to IndexedDB FIRST, then syncs. The app never depends on the server being reachable.

---

## Database Schema

### Entity Relationship Diagram

```
users ──────────────────────────────────┐
  │                                     │
  │ (created_by / administered_by /     │
  │  recorded_by)                       │
  ▼                                     │
cows ◄──── health_issues ◄──── treatments
  │ ▲            │                  │
  │ │ sire_id    │                  ▼
  │ │ dam_id     │            medications (lookup)
  │ └───┘        │
  │              │
  ├── milk_records
  │   (litres per session, auto-save,
  │    flashes RED if on withdrawal)
  │
  ├── breeding_events
  │   (heat, AI, bull service, preg check,
  │    calving, auto-calculated dates)
  │
  ▼              ▼
sync_log         audit_log
```

### Table Definitions

#### `users`
```sql
CREATE TABLE users (
  id            VARCHAR(36) PRIMARY KEY,       -- UUID
  username      VARCHAR(50) NOT NULL UNIQUE,
  pin_hash      VARCHAR(255),                  -- bcrypt hash (workers)
  password_hash VARCHAR(255),                  -- bcrypt hash (admin)
  full_name     VARCHAR(100) NOT NULL,
  role          ENUM('admin', 'worker') NOT NULL DEFAULT 'worker',
  permissions   JSON,                          -- feature-level access control
  language      ENUM('en', 'af') DEFAULT 'en',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Permission model (stored in JSON):**
```json
{
  "can_log_issues": true,
  "can_log_treatments": true,
  "can_log_breeding": true,
  "can_record_milk": true,
  "can_view_dashboard": false,
  "can_view_analytics": false,
  "can_view_reports": false,
  "can_manage_cows": false,
  "can_manage_medications": false,
  "can_manage_users": false
}
```
Default worker: log issues + treatments + breeding + milk. Admin: everything.

#### `cows`
```sql
CREATE TABLE cows (
  id            VARCHAR(36) PRIMARY KEY,       -- UUID
  tag_number    VARCHAR(20) NOT NULL UNIQUE,    -- ear tag
  name          VARCHAR(50),                    -- optional name
  date_of_birth DATE,
  breed         VARCHAR(50),
  sex           ENUM('cow', 'bull') DEFAULT 'cow',
  status        ENUM('active', 'dry', 'sold', 'deceased') DEFAULT 'active',
  sire_id       VARCHAR(36) NULL REFERENCES cows(id),   -- father (bull)
  dam_id        VARCHAR(36) NULL REFERENCES cows(id),    -- mother (cow)
  notes         TEXT,
  created_by    VARCHAR(36) REFERENCES users(id),
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME NULL                   -- soft delete
);
```

#### `medications`
```sql
CREATE TABLE medications (
  id                    VARCHAR(36) PRIMARY KEY,
  name                  VARCHAR(100) NOT NULL,
  active_ingredient     VARCHAR(100),
  withdrawal_milk_hours INT NOT NULL DEFAULT 0,
  withdrawal_meat_days  INT NOT NULL DEFAULT 0,
  default_dosage        VARCHAR(100),
  unit                  VARCHAR(20),
  notes                 TEXT,
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### `health_issues`
```sql
CREATE TABLE health_issues (
  id             VARCHAR(36) PRIMARY KEY,
  cow_id         VARCHAR(36) NOT NULL REFERENCES cows(id),
  reported_by    VARCHAR(36) NOT NULL REFERENCES users(id),
  issue_type     ENUM('lameness', 'mastitis', 'respiratory', 'digestive',
                      'fever', 'bad_milk', 'eye', 'calving', 'other') NOT NULL,
  severity       ENUM('low', 'medium', 'high') DEFAULT 'medium',
  affected_teats JSON,                           -- e.g., ["front_left", "rear_right"]
  description    TEXT,
  observed_at    DATETIME NOT NULL,
  status         ENUM('open', 'treating', 'resolved') DEFAULT 'open',
  resolved_at    DATETIME NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  synced_at      DATETIME NULL
);
```

#### `treatments`
```sql
CREATE TABLE treatments (
  id                    VARCHAR(36) PRIMARY KEY,
  health_issue_id       VARCHAR(36) REFERENCES health_issues(id),
  cow_id                VARCHAR(36) NOT NULL REFERENCES cows(id),
  medication_id         VARCHAR(36) NOT NULL REFERENCES medications(id),
  administered_by       VARCHAR(36) NOT NULL REFERENCES users(id),
  dosage                VARCHAR(50),
  cost                  DECIMAL(10,2),
  treatment_date        DATETIME NOT NULL,
  withdrawal_end_milk   DATETIME,               -- auto-calculated
  withdrawal_end_meat   DATETIME,               -- auto-calculated
  is_vet_visit          BOOLEAN DEFAULT FALSE,
  vet_name              VARCHAR(100),
  notes                 TEXT,
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  synced_at             DATETIME NULL
);
```

#### `milk_records`
```sql
CREATE TABLE milk_records (
  id              VARCHAR(36) PRIMARY KEY,
  cow_id          VARCHAR(36) NOT NULL REFERENCES cows(id),
  recorded_by     VARCHAR(36) NOT NULL REFERENCES users(id),
  session         ENUM('morning', 'afternoon', 'evening') NOT NULL,
  litres          DECIMAL(6,2) NOT NULL,
  recording_date  DATE NOT NULL,
  milk_discarded  BOOLEAN DEFAULT FALSE,
  discard_reason  VARCHAR(255),
  notes           TEXT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  synced_at       DATETIME NULL,
  UNIQUE KEY unique_cow_session_date (cow_id, session, recording_date)
);
```

#### `breeding_events`
```sql
CREATE TABLE breeding_events (
  id                    VARCHAR(36) PRIMARY KEY,
  cow_id                VARCHAR(36) NOT NULL REFERENCES cows(id),
  event_type            ENUM('heat_observed', 'ai_insemination', 'bull_service',
                             'preg_check_positive', 'preg_check_negative',
                             'calving', 'abortion') NOT NULL,
  event_date            DATETIME NOT NULL,
  sire_id               VARCHAR(36) NULL REFERENCES cows(id),
  semen_id              VARCHAR(100),
  inseminator           VARCHAR(100),
  heat_signs            JSON,
  preg_check_method     ENUM('manual', 'ultrasound', 'blood_test') NULL,
  calving_details       JSON,
  cost                  DECIMAL(10,2),
  expected_next_heat    DATE,                    -- auto: event_date + 21 days
  expected_preg_check   DATE,                    -- auto: event_date + 35 days
  expected_calving      DATE,                    -- auto: event_date + 283 days
  expected_dry_off      DATE,                    -- auto: expected_calving - 60 days
  notes                 TEXT,
  recorded_by           VARCHAR(36) REFERENCES users(id),
  created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  synced_at             DATETIME NULL
);
```

#### `sync_log`
```sql
CREATE TABLE sync_log (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) REFERENCES users(id),
  device_id     VARCHAR(100),
  action        ENUM('push', 'pull') NOT NULL,
  records_count INT,
  status        ENUM('success', 'partial', 'failed'),
  error_message TEXT,
  synced_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `audit_log`
```sql
CREATE TABLE audit_log (
  id          VARCHAR(36) PRIMARY KEY,
  user_id     VARCHAR(36) REFERENCES users(id),
  action      VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   VARCHAR(36),
  old_values  JSON,
  new_values  JSON,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Why UUIDs Instead of Auto-Increment IDs

Multiple devices create records offline. Auto-increment IDs would collide. UUIDs are generated client-side and are globally unique — no coordination needed.

---

## Folder Structure

```
dairy-farm-app/
├── package.json
│
├── server/
│   ├── index.js                        # Express entry point
│   ├── config/
│   │   ├── database.js                 # Knex connection config
│   │   └── env.js                      # Environment variables
│   ├── middleware/
│   │   ├── auth.js                     # JWT verification
│   │   ├── authorize.js                # Permission checking
│   │   └── errorHandler.js             # Centralized error handling
│   ├── routes/
│   │   ├── auth.js                     # Login, token refresh
│   │   ├── cows.js                     # CRUD cows
│   │   ├── healthIssues.js             # CRUD health issues
│   │   ├── treatments.js               # CRUD treatments + withdrawal calc
│   │   ├── medications.js              # CRUD medications
│   │   ├── milkRecords.js              # CRUD milk records (auto-save)
│   │   ├── breedingEvents.js           # CRUD breeding events + auto-calc
│   │   ├── users.js                    # User management (admin)
│   │   ├── sync.js                     # Offline sync endpoint
│   │   ├── analytics.js                # Analytics aggregation endpoints
│   │   └── reports.js                  # PDF/Excel generation
│   ├── services/
│   │   ├── withdrawalService.js        # Withdrawal period calculation
│   │   ├── breedingService.js          # Reproductive date calculations
│   │   ├── analyticsService.js         # Stats aggregation
│   │   ├── syncService.js              # Sync conflict resolution
│   │   └── reportService.js            # PDF/Excel generation
│   └── migrations/
│       ├── 001_create_users.js
│       ├── 002_create_cows.js
│       ├── 003_create_medications.js
│       ├── 004_create_health_issues.js
│       ├── 005_create_treatments.js
│       ├── 006_create_milk_records.js
│       ├── 007_create_breeding_events.js
│       ├── 008_create_sync_log.js
│       └── 009_create_audit_log.js
│
├── client/
│   ├── index.html
│   ├── vite.config.js
│   ├── public/
│   │   ├── manifest.json               # PWA manifest
│   │   ├── sw.js                       # Service Worker
│   │   └── icons/                      # App icons (various sizes)
│   └── src/
│       ├── main.js
│       ├── App.vue
│       ├── router/
│       │   └── index.js
│       ├── stores/                     # Pinia stores
│       │   ├── auth.js
│       │   ├── cows.js
│       │   ├── healthIssues.js
│       │   ├── treatments.js
│       │   ├── milkRecords.js
│       │   ├── breedingEvents.js
│       │   ├── analytics.js
│       │   └── sync.js
│       ├── db/
│       │   └── indexedDB.js            # Dexie.js wrapper
│       ├── services/
│       │   ├── api.js                  # Axios instance + interceptors
│       │   └── syncManager.js          # Offline sync logic
│       ├── i18n/
│       │   ├── index.js
│       │   ├── en.json
│       │   └── af.json
│       ├── views/
│       │   ├── LoginView.vue
│       │   ├── DashboardView.vue
│       │   ├── CowListView.vue
│       │   ├── CowDetailView.vue       # Info, lineage, repro summary, treatments
│       │   ├── LogIssueView.vue         # Big buttons, teat selector, quick log
│       │   ├── LogTreatmentView.vue
│       │   ├── MilkRecordingView.vue    # Auto-save, search, withdrawal alerts
│       │   ├── BreedingHubView.vue      # Quick actions, stats, alerts, events
│       │   ├── LogBreedingView.vue      # Log heat/AI/bull/preg check
│       │   ├── CowReproView.vue         # Per-cow reproduction timeline
│       │   ├── WithdrawalListView.vue   # Cows on withdrawal with countdowns
│       │   ├── AnalyticsView.vue        # Charts, stats, predictions
│       │   ├── ReportsView.vue          # Report selection + export
│       │   └── admin/
│       │       ├── UserManagement.vue
│       │       └── MedicationManagement.vue
│       └── components/
│           ├── CowCard.vue
│           ├── CowSearchDropdown.vue    # Reusable searchable cow selector
│           ├── TeatSelector.vue         # 4-button udder diagram
│           ├── WithdrawalBanner.vue     # Red alert banner
│           ├── WithdrawalFlash.vue      # Full-screen red flash overlay
│           ├── MilkEntryCard.vue        # Auto-save milk input per cow
│           ├── BreedingEventCard.vue    # Breeding event display
│           ├── GestationProgressBar.vue # Visual pregnancy progress
│           ├── QuickActionButton.vue
│           ├── SyncIndicator.vue
│           └── LanguageToggle.vue
│
└── README.md
```

---

## Authentication & Authorization

### Login Flow

```
ADMIN (Father):
  username + password → POST /api/auth/login
  → bcrypt compare → JWT token (24h expiry)
  → stored in IndexedDB (not localStorage, for offline)

WORKER:
  username + PIN (4-6 digits) → POST /api/auth/login-pin
  → bcrypt compare → JWT token (7 day expiry)
  → stored in IndexedDB

OFFLINE LOGIN:
  → JWT + user profile cached in IndexedDB
  → If token still valid, user can work offline
  → If expired, must connect to refresh
```

### Security Measures

- All passwords/PINs hashed with bcrypt (cost factor 12)
- JWT tokens with expiration
- HTTPS enforced (cPanel free Let's Encrypt SSL)
- Rate limiting on login endpoints (prevent PIN brute-force)
- PIN lockout after 5 failed attempts
- Soft deletes everywhere (no data loss ever)
- Audit log tracks every change with who/when
- Input validation on ALL API endpoints (Joi)
- SQL injection prevented (Knex parameterized queries)
- XSS prevented (Vue auto-escapes by default)
- CORS configured (only allow your domain)
- Environment variables for secrets (never in code)

---

## Key Feature Specifications

### Withdrawal Period Logic (Critical Compliance)

```
When a treatment is logged:

1. Look up medication.withdrawal_milk_hours (e.g., 96 hours)
2. Look up medication.withdrawal_meat_days (e.g., 28 days)
3. Calculate:
   withdrawal_end_milk = treatment_date + withdrawal_milk_hours
   withdrawal_end_meat = treatment_date + withdrawal_meat_days

4. If cow has MULTIPLE active treatments:
   → Use the LATEST withdrawal_end date (most conservative)

5. On Withdrawal Alert screen and Milk Recording:
   → Query: treatments WHERE withdrawal_end_milk > NOW()
   → Display with BIG RED styling, impossible to miss

6. During Milk Recording:
   → If cow is on withdrawal, card flashes red with warning bar
   → Worker can still record litres but auto-marked as discarded
   → Discard reason auto-filled with medication and date
```

### Milk Recording — Auto-Save Behavior

```
1. Worker opens Milk Recording → selects session (morning/afternoon/evening)
2. Can search for specific cow by tag # or name
3. All active cows for the session are listed
4. Worker types litres into input field
5. After 1.5 seconds of no typing (debounce):
   → Record auto-saves to IndexedDB immediately
   → If online, syncs to server
   → Visual badge: "Saving..." → "✓ Saved" → "✓ Synced"
6. NO SAVE BUTTON — data is never lost even if worker walks away
7. Withdrawal cows: card flashes red, litres auto-marked as discarded
8. Dry cows: input disabled, greyed out
9. Summary at bottom: "X of Y recorded • Z discarded"
```

### Breeding & Reproduction Calculations

```
Key constants:
- Estrous cycle: ~21 days (range 17-24)
- Gestation: ~283 days (range 279-287)
- Postpartum interval: ~55 days (first-calver: ~65 days)
- Preg check timing: ~35 days after service
- Dry-off: ~60 days before expected calving
- Voluntary waiting period: ~50 days post-calving

When AI or Bull Service is logged:
  → expected_next_heat = event_date + 21 days
  → expected_preg_check = event_date + 35 days
  → expected_calving = event_date + 283 days
  → expected_dry_off = expected_calving - 60 days

When Heat Observed is logged:
  → expected_next_heat = event_date + 21 days (if not bred)

When Calving is logged:
  → Update cow status
  → Postpartum end: calving_date + 55 days (or 65 for first-calver)
  → Expected first heat: calving_date + 55 days
```

### Navigation & Breeding Event Flow

```
Entry points to log breeding events:
  1. Dashboard → "Breeding & Repro" quick action → Breeding Hub
  2. Breeding Hub → quick action buttons: "Log Heat", "Log AI", "Log Bull Service", "Log Preg Check"

From Cow Detail page:
  → Female cows show "Reproduction" summary section
  → Tappable → opens Cow Reproduction Timeline
  → That page has "Log Event for This Cow" (pre-fills cow, skips search)

Anyone can log any breeding event (no permission restrictions).

Bottom nav: Home | Cows | Log | Milk | Breed
```

---

## Analytics & Reports

### Analytics Page — Phased Build

**Phase 1 (MVP — included with initial build):**
- Total cows by status (active, dry, sold, deceased)
- Unhealthiest cows — most health issues / treatments in last 90 days (culling candidates)

**Phase 6 (full analytics):**
- Seasonal issue predictor — "Based on past data, expect more [issue type] in the next 2 months" (group health_issues by month and issue_type across all years, show top issues for upcoming 2 calendar months)
- Milk production — total litres per month, trend chart
- Top performing cows — ranked by average daily litres
- Milk wasted — litres discarded due to withdrawal per month + estimated cost
- Breeding overview — pregnant vs open cow count, expected calvings per month
- Treatment costs — total medication spend per month
- Cow health score — composite metric based on issues, treatments, recovery time

### Report Exports (Phase 6)

All reports filterable by date range, exportable as PDF and Excel:

| Report | Contents |
|--------|----------|
| Treatment History | All treatments by cow, date, medication, dosage, cost, who administered |
| Withdrawal Compliance | Proof all withdrawal periods were respected, any discarded milk logged |
| Medication Usage | Which medications used, quantities, total cost |
| Milk Production | Daily/monthly litres per cow and total, averages, trends |
| Breeding & Reproduction | AI events, pregnancy rates, calving dates, services per conception |
| Herd Health Summary | Issues by type and severity, resolution times, seasonal patterns |

---

## Phased Build Plan

### Phases 1–5: COMPLETE

All core features are built and working:
- **Phase 1**: Backend foundation (Express, Knex, Auth, Cow CRUD, basic analytics)
- **Phase 2**: Vue 3 PWA frontend (cow registry, IndexedDB, i18n)
- **Phase 3**: Medications, treatments, withdrawal engine
- **Phase 4**: Health issue logging (quick log, teat selector, issue types)
- **Phase 4B**: Milk recording (auto-save, withdrawal alerts, discard tracking)
- **Phase 4C**: Breeding & reproduction (breeding hub, auto-dates, breed types, life phases, dry-off, post-calving flow)
- **Phase 5**: Offline sync engine (queue, push/pull, background sync, offline login)
- **Cross-cutting**: Feature flags, code quality tooling, breeding hub redesign

Completed sub-plans: [breeding-v2](plans/breeding-v2.md), [offline-sync](plans/offline-sync.md), [feature-flags](plans/feature-flags.md), [breeding-hub-redesign](plans/breeding-hub-redesign.md)

---

### Phase 7: Admin Settings + User Management — NOT STARTED (do first)
**Goal:** Admin can manage users, permissions, app settings, data export, and audit trail.

> Sub-plan: [plans/phase-7-admin.md](plans/phase-7-admin.md)

| Sub-phase | Scope |
|-----------|-------|
| 7.1 | User CRUD API (GET/POST/PATCH/DELETE /api/users) |
| 7.2 | User Management UI (list, add/edit worker, PIN, permissions checkboxes) |
| 7.3 | App Settings (farm name, default language — migration + API + UI) |
| 7.4 | Data Export (JSON dump download, admin-only) |
| 7.5 | Audit Log (migration + helper + API + admin viewer UI) |

Already complete from earlier phases: Medication management (Phase 3), Feature flags

**Deliverable:** Full admin control — manage workers, set permissions, configure farm, export data, audit trail.

---

### Phase 6A: Analytics Charts — NOT STARTED
**Goal:** Full analytics view with charts. Dashboard unchanged. Reports deferred to 6B.

> Sub-plan: [plans/phase-6a-analytics.md](plans/phase-6a-analytics.md)

| Sub-phase | Scope |
|-----------|-------|
| 6A.1 | Analytics API — 7 endpoints (unhealthiest, milk trends, top producers, wasted milk, breeding overview, treatment costs, seasonal predictor) |
| 6A.2 | Install chart.js + vue-chartjs |
| 6A.3 | Enhanced AnalyticsView — chart sections for each metric, feature-flag gated |

**Deliverable:** Rich analytics dashboard with charts, trends, and predictions.

---

### Phase 6C: Analytics Time Range Filter Chips — NOT STARTED

> Sub-plan: [plans/phase-6c-analytics-time-filter.md](plans/phase-6c-analytics-time-filter.md)

---

### Phase 6D: Herd Health Analytics Enhancement — COMPLETE

> Sub-plan: [plans/phase-6d-health-kpis.md](plans/phase-6d-health-kpis.md) (COMPLETE)

---

### Phase 6E: Herd Structure Analytics Enhancement — COMPLETE

> Sub-plan: [plans/phase-6e-structure-kpis.md](plans/phase-6e-structure-kpis.md) (COMPLETE)

---

### Phase 8: Milk Recording History & Refinement — NOT STARTED

> Sub-plan: [plans/phase-8-milk-history.md](plans/phase-8-milk-history.md)

**Goal:** Split milk feature into recording (fast entry) + history (audit trail). Fix time picker UX.

| Step | Task |
|------|------|
| 8.1 | Backend: paginated milk records API with date range/user filters |
| 8.2 | Frontend: Milk History view + MilkRecordCard molecule |
| 8.3 | Recording page: always-show time picker, UX clarity |
| 8.4 | Polish, dead code removal, docs, final test pass |

**Deliverable:** Two complementary milk pages — fast recording + filterable audit trail.

---

### Phase 11: Permission Enforcement & PIN Fix — IN PROGRESS

> Sub-plan: [plans/phase-11-permissions-pin-fix.md](plans/phase-11-permissions-pin-fix.md)

**Goal:** Fix PIN length mismatch (standardize to 4 digits) and enforce worker permissions across backend routes, frontend router, and navigation UI.

| Step | Task |
|------|------|
| 11.1 | Standardize PIN to 4 digits (backend Joi, frontend form, i18n) |
| 11.2 | Backend permission enforcement (authorize middleware on write routes + analytics) |
| 11.3 | Frontend router permission guard (requiresPermission meta + auth store hasPermission) |
| 11.4 | Frontend navigation filtering (BottomNav + DashboardView permission checks) |
| 11.5 | Tests (backend permission tests, updated frontend tests) |
| 11.6 | i18n, CLAUDE.md, MEMORY.md cleanup |

**Deliverable:** Workers only see and can use features they have permission for; PINs consistently 4 digits.

---

### Phase 9A: Milk History Filters & Pagination — NOT STARTED

> Sub-plan: [plans/phase-9a-milk-history-filters.md](plans/phase-9a-milk-history-filters.md)

**Goal:** Enhance Milk History with proper pagination, cow search, and custom date range filters.

| Step | Task |
|------|------|
| 9A.1 | Backend: add `total_litres` to paginated milk records response |
| 9A.2 | Frontend: replace "load more" with prev/next pagination |
| 9A.3 | Frontend: cow search filter (CowSearchDropdown) |
| 9A.4 | Frontend: custom date range + "All" time filter |
| 9A.5 | Styling & UX polish |
| 9A.6 | Update & expand client tests |
| 9A.7 | Final review: refactor, dead code, efficiency audit |

**Deliverable:** Milk History with accurate totals, page navigation, cow filter, and flexible date controls.

---

### Phase 6B: Report Exports — COMPLETE
> Sub-plan: [plans/phase-6b-reports.md](plans/phase-6b-reports.md) (COMPLETE)

**Goal:** Audit-ready PDF/Excel reports for all farm data.

| Step | Task |
|------|------|
| 6B.1 | Report generation API (pdfkit + exceljs) |
| 6B.2 | Withdrawal compliance report |
| 6B.3 | Treatment history report |
| 6B.4 | Discarded milk report |
| 6B.5 | Medication usage, milk production, breeding, herd health reports |
| 6B.6 | Report UI (ReportsView.vue — select type, filters, download) |
| 6B.7 | Polish, docs, memory updates |

**Deliverable:** 7 downloadable PDF/Excel reports for compliance and record-keeping. 35 server tests, 11 client tests.

---

## Key Library Choices

| Purpose | Library | Why |
|---------|---------|-----|
| ORM | Knex.js | Lightweight, migrations, database-agnostic |
| Auth hashing | bcryptjs | Pure JS, no native build issues on cPanel |
| JWT | jsonwebtoken | Industry standard |
| Validation | Joi | Input validation on all API routes |
| Frontend state | Pinia | Official Vue 3 state management |
| IndexedDB | Dexie.js | Best IndexedDB wrapper, offline support |
| i18n | vue-i18n | Official Vue internationalization |
| PWA | vite-plugin-pwa | Automatic service worker generation |
| PDF reports | pdfkit | Server-side PDF generation |
| Excel reports | exceljs | Server-side Excel generation |
| HTTP client | axios | Request interceptors for auth tokens |
| Charts | Chart.js / vue-chartjs | Analytics visualizations |

---

## Deployment Strategy (cPanel)

```
Local Development:
  npm run dev        → Runs Vue dev server + Express concurrently

Build:
  npm run build      → Vite builds Vue to client/dist/

On cPanel:
  1. Upload project via Git or file manager
  2. Set up Node.js app in cPanel (entry: server/index.js)
  3. Create MySQL database + user in cPanel
  4. Set environment variables:
     - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
     - JWT_SECRET (long random string)
     - NODE_ENV=production
  5. Run migrations: npx knex migrate:latest
  6. Express serves client/dist/ as static files
  7. Enable HTTPS via Let's Encrypt (free in cPanel)

Updates:
  1. Build locally → push to server
  2. Restart Node.js app in cPanel
  3. PWA auto-updates on next user visit
```

---

## What "Done" Looks Like

When all 7 phases are complete:

1. ✅ Installable on PC and phone (PWA)
2. ✅ Works completely offline for field workers
3. ✅ Health issues logged in ~10 seconds (big buttons, teat selector)
4. ✅ All treatments tracked with medication, dosage, cost
5. ✅ Automatic withdrawal period calculation
6. ✅ BIG RED warnings during milking for withdrawal cows
7. ✅ Milk recording with auto-save (no save button)
8. ✅ Daily milk production per cow per session
9. ✅ Cow lineage (sire/dam) with searchable dropdowns
10. ✅ Full breeding & reproduction tracking (heat prediction, AI, gestation, calving alerts)
11. ✅ Auto-calculated reproductive dates (next heat, preg check, calving, dry-off)
12. ✅ Analytics with seasonal issue prediction and culling candidates
13. ✅ Audit-ready reports (PDF/Excel)
14. ✅ English and Afrikaans
15. ✅ Role-based access with per-feature permissions
16. ✅ Zero data loss (offline sync + soft deletes + audit log)
17. ✅ Single cPanel server deployment
18. ✅ Database-migration-ready via Knex ORM
