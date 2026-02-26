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

### Phase 1: Foundation (Backend Core + Auth + Cow Registry + Basic Analytics) — COMPLETE
**Goal:** Server runs, admin can log in, manage cows, see basic stats.

| Step | Task | Details |
|------|------|---------|
| 1.1 | Project scaffolding | Init package.json, install deps, folder structure |
| 1.2 | Database setup | Knex config, migrations for users + cows tables |
| 1.3 | Express server | Basic server, env config, error handling middleware |
| 1.4 | Auth system | Login routes, bcrypt, JWT, auth middleware, PIN login |
| 1.5 | Cow CRUD API | GET/POST/PUT/DELETE /api/cows with validation |
| 1.6 | Basic analytics API | Total cows by status, unhealthiest cows (most issues in 90d) |
| 1.7 | Seed data | Admin user, sample cows for testing |
| 1.8 | Test with Postman/curl | Verify all endpoints work |

**Deliverable:** Working API with auth, cow management, and basic stats.

---

### Phase 2: Frontend Shell + Cow Registry UI — COMPLETE
**Goal:** Installable PWA where admin can log in, manage cows, see basic analytics.

| Step | Task | Details |
|------|------|---------|
| 2.1 | Vue 3 project setup | Vite, Router, Pinia, vue-i18n |
| 2.2 | PWA configuration | manifest.json, service worker, icons |
| 2.3 | i18n setup | English + Afrikaans translation files |
| 2.4 | Login page | Admin login + worker PIN login, language toggle |
| 2.5 | Bottom navigation | Home, Cows, Log, Milk, Breed tabs |
| 2.6 | Cow list view | Show all cows, search by tag/name, status badges |
| 2.7 | Cow add/edit forms | Tag number, name, breed, DOB, sex, status |
| 2.8 | Cow lineage fields | Searchable CowSearchDropdown for Sire and Dam |
| 2.9 | Cow detail view | Info, parents (linked), offspring list |
| 2.10 | Basic analytics view | Total cows by status, unhealthiest cows list |
| 2.11 | IndexedDB setup | Dexie.js wrapper, cow table mirroring |
| 2.12 | Basic sync | Pull cows from server → IndexedDB on login |
| 2.13 | Build + deploy config | Vue build outputs to client/dist, Express serves it |

**Deliverable:** Installable app. Login, manage cows with lineage, basic stats. Works on PC and phone.

---

### Phase 3: Medications + Treatments + Withdrawal Engine — COMPLETE
**Goal:** Core treatment workflow with automatic withdrawal calculations.

| Step | Task | Details |
|------|------|---------|
| 3.1 | Medications API + migration | CRUD for medications table |
| 3.2 | Treatments API + migration | CRUD with auto withdrawal date calculation |
| 3.3 | Withdrawal calculation service | treatment_date + medication.withdrawal_milk_hours = withdrawal_end |
| 3.4 | Medication management UI (admin) | Add/edit medications with withdrawal periods |
| 3.5 | Treatment logging UI | Select cow → select medication → auto-fill dosage → see withdrawal preview → save |
| 3.6 | Withdrawal alert screen | BIG RED list of cows on withdrawal with countdowns |
| 3.7 | Cow detail: treatment history | All treatments for a cow with withdrawal status |
| 3.8 | IndexedDB for medications + treatments | Offline storage + sync |

**Deliverable:** Full treatment workflow. Red warnings for withdrawal cows.

---

### Phase 4: Health Issue Logging (Quick Log) — COMPLETE
**Goal:** Workers can log health issues in 10 seconds with big buttons.

| Step | Task | Details |
|------|------|---------|
| 4.1 | Health issues API + migration | CRUD endpoints |
| 4.2 | Quick log UI | Big icon buttons for each issue type |
| 4.3 | Cow selector (fast) | CowSearchDropdown — type tag or search name |
| 4.4 | Severity selector | Three big buttons: Low / Medium / High |
| 4.5 | Teat selector (conditional) | When mastitis/bad_milk/teat-related: 4 teat buttons (FL, FR, RL, RR) with udder diagram. Stored as JSON |
| 4.6 | Optional notes | Short text input |
| 4.7 | Link issue to treatment | When logging treatment, optionally link to open issue |
| 4.8 | Issue status tracking | Open → Treating → Resolved |
| 4.9 | IndexedDB for issues | Offline logging + sync |

**Deliverable:** Workers log issues in ~10 seconds. Syncs when back online.

---

### Phase 4B: Milk Production Recording — COMPLETE
**Goal:** Workers record daily milk. Auto-saves. Withdrawal flash alerts.

| Step | Task | Details |
|------|------|---------|
| 4B.1 | Milk records API + migration | CRUD with unique constraint per cow/session/date |
| 4B.2 | Milk recording UI | Search cow by tag/name. Session tabs. Per-cow litres input. **NO SAVE BUTTON** — auto-saves (debounced 1.5s). "✓ Saved" badge per row |
| 4B.3 | Withdrawal flash alert | Cow on withdrawal → card flashes RED with warning bar. Litres auto-marked as discarded |
| 4B.4 | Discard tracking | milk_discarded = TRUE with auto-filled reason |
| 4B.5 | Milk production history | Per-cow litres over time. Farm daily/weekly/monthly totals |
| 4B.6 | IndexedDB for milk records | Offline recording + sync |

**Deliverable:** Milk recording with zero friction. Withdrawal alerts at the moment they matter.

---

### Phase 4C: Breeding & Reproduction Tracking — COMPLETE
**Goal:** Track full reproductive lifecycle.
> Sub-plan: [plans/breeding-v2.md](plans/breeding-v2.md) — Enhanced breeding with configurable breed types, life phases, dry-off management (COMPLETE)

| Step | Task | Details |
|------|------|---------|
| 4C.1 | Breeding events API + migration | CRUD for breeding_events table |
| 4C.2 | Auto-calculation service | On AI/bull service: next heat (+21d), preg check (+35d), calving (+283d), dry-off (calving -60d) |
| 4C.3 | Breeding Hub view | Quick action buttons (Log Heat, Log AI, Log Bull Service, Log Preg Check). Stats (pregnant/open/due soon). Upcoming alerts with countdowns. Recent events |
| 4C.4 | Log breeding event UI | Searchable cow selector (pre-filled from cow detail). Big buttons for event type. AI fields. Auto-calculated dates shown |
| 4C.5 | Heat prediction alerts | Last heat/calving + 21d cycle → predict expected heats. Show on dashboard + breeding hub |
| 4C.6 | Cow reproduction detail | Gestation progress bar, key dates, cycle history, lifetime stats. Accessible from cow detail page |
| 4C.7 | Calving countdown alerts | Alerts at 14d, 7d, 3d before expected calving |
| 4C.8 | Cow detail integration | Female cows: repro summary section (tappable → full timeline). "Log Event for This Cow" button |
| 4C.9 | IndexedDB for breeding events | Offline logging + sync |

**Deliverable:** Full reproductive management with predictions, gestation tracking, calving alerts.

---

### Phase 5: Offline Sync Engine (Hardening) — COMPLETE
**Goal:** Bulletproof offline. No data loss ever.
> Sub-plan: [plans/offline-sync.md](plans/offline-sync.md) — Full sync engine implementation (COMPLETE)

| Step | Task | Details |
|------|------|---------|
| 5.1 | Sync queue system | Queue all offline writes in IndexedDB |
| 5.2 | Background sync | Service Worker triggers sync when online |
| 5.3 | Conflict resolution | Last-write-wins with timestamp comparison |
| 5.4 | Sync status UI | Green (synced), yellow (pending), red (failed) |
| 5.5 | Retry logic | Exponential backoff for failed syncs |
| 5.6 | Full data pull | On first login or force refresh, pull all data |
| 5.7 | Sync log | Track sync events for debugging |
| 5.8 | Offline login | Cached JWT + user profile works without server |

**Deliverable:** App works offline for days. Syncs automatically when connected.

---

### Phase 6: Full Analytics + Dashboard + Reports — NOT STARTED
**Goal:** Complete analytics, enhanced dashboard, audit-ready exports.

| Step | Task | Details |
|------|------|---------|
| 6.1 | Full analytics API | All aggregation endpoints |
| 6.2 | Analytics view | Seasonal predictor, milk trends, top performers, wasted milk, breeding overview, costs |
| 6.3 | Dashboard (enhanced) | Withdrawal alerts, expected heats, calving due, recent issues, quick actions |
| 6.4 | Report generation API | PDF (pdfkit) and Excel (exceljs) |
| 6.5 | Treatment history report | Filterable by date, cow, medication |
| 6.6 | Withdrawal compliance report | Proof withdrawal periods respected |
| 6.7 | Medication usage report | Usage quantities and costs |
| 6.8 | Milk production report | Litres, averages, trends |
| 6.9 | Breeding report | AI events, pregnancy rates, calving |
| 6.10 | Report UI | Select type → filters → download PDF/Excel |

**Deliverable:** Full analytics + audit-ready reports.

---

### Phase 7: Admin Settings + User Management — NOT STARTED
**Goal:** Father controls users, permissions, settings.

| Step | Task | Details |
|------|------|---------|
| 7.1 | User management API | CRUD users, set permissions |
| 7.2 | User management UI | Add worker, set PIN, toggle permissions |
| 7.3 | Medication management | Admin edits medication list |
| 7.4 | App settings | Farm name, default language |
| 7.5 | Data export | Full database backup |

**Deliverable:** Full admin control over users, permissions, and settings.

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
