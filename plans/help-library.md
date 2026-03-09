# Help Library — Implementation Plan

> Frontend-only feature. No backend changes, no migrations, no new dependencies.

## Overview

An in-app documentation system with visual CSS-based flow diagrams for each workflow. Helps non-technical farmers understand how to use the app. Accessible from the Profile page.

---

## Phase 1: Infrastructure

**Goal**: FlowDiagram component, view shells, routes, ProfileView button. Subsequent phases only add content.

### 1.1 Create `client/src/components/molecules/FlowDiagram.vue`

Props:
- `nodes: Array` — `[{ id, label, type: 'action'|'system'|'decision', column?, row? }]`
- `connections: Array` — `[{ from, to, label? }]`
- `direction: String` — `'vertical'` (default)

Node types:
- **action** (user does something): white bg, primary border, solid
- **system** (app does automatically): light green bg, dashed primary border
- **decision** (yes/no branch): accent card with two outgoing connectors

Layout: CSS Grid with explicit row/column placement. Connections via absolutely positioned lines with CSS arrow markers. Mobile-first, horizontally scrollable if wide.

All text comes pre-translated from parent via `label` prop.

### 1.2 Create `client/src/config/helpTopicData.js`

Topic registry exporting:
- `slug`, `category`, `icon`, `adminOnly`
- `getNodes(t)` — returns FlowDiagram nodes with translated labels
- `getConnections()` — returns FlowDiagram connections

### 1.3 Create `client/src/views/HelpLibraryView.vue`

- AppHeader with `show-back back-to="/profile"`
- Categorized topic list: Daily Tasks, Health & Treatment, Breeding, Cow Management, Admin/Settings
- Admin topics only visible to admin role
- Each topic is a RouterLink to `/help/:slug`

### 1.4 Create `client/src/views/HelpTopicView.vue`

Renders topic content by slug from route params:
1. "What is this?" — `t('help.topics.<slug>.what')`
2. "When do I use it?" — `t('help.topics.<slug>.when')`
3. FlowDiagram — nodes/connections from `helpTopicData.js`
4. Numbered steps with "why" — array from i18n
5. "What happens next?" — system automations
6. Tips / Edge cases — array from i18n

### 1.5 Create `client/src/views/help/BreedingLifecycleView.vue`

Shell for the breeding lifecycle overview (content added in Phase 4).

### 1.6 Add routes to `client/src/router/index.js`

```js
{ path: '/help', name: 'help-library', component: HelpLibraryView, meta: { requiresAuth: true } }
{ path: '/help/breeding-lifecycle', name: 'help-breeding-lifecycle', component: BreedingLifecycleView, meta: { requiresAuth: true } }
{ path: '/help/:topic', name: 'help-topic', component: HelpTopicView, meta: { requiresAuth: true } }
```

Note: `/help/breeding-lifecycle` must be before `/help/:topic`.

### 1.7 Add Help Library button to `ProfileView.vue`

RouterLink below settings section, visible to all users.

### 1.8 Add initial i18n keys

`help` namespace: title, category names, section headings. Both `en.json` and `af.json`.

### 1.9 Verification

- Profile → Help Library button visible → lands on `/help`
- Categorized list renders → click topic → lands on `/help/<slug>`
- Back navigation works at each level

---

## Phase 2: Daily Tasks Topics (2 topics)

### 2.1 Recording Milk (`recording-milk`)

- Flow: Open Milk → Select session → Select cow → Enter litres → Withdrawal check → Save
- Decision: "Cow on withdrawal?" → Yes: warning badge → No: normal save
- Tips: AM/PM sessions, offline saves, withdrawal alerts

### 2.2 Viewing Milk History (`milk-history`)

- Flow: Open Milk History → Use filters → View records → Sort
- Tips: Discarded milk filter, search by tag/name/recorder, export via reports

---

## Phase 3: Health & Treatment Topics (4 topics)

### 3.1 Logging a Health Issue (`logging-health-issue`)

- Flow: Dashboard/Cow → Log Issue → Select cow → Issue type → Severity → Teats (if mastitis) → Notes → Save
- Decision: "Is it mastitis?" → Yes: TeatSelector → No: skip
- System: Creates issue, appears in Open Issues

### 3.2 Adding a Treatment (`adding-treatment`)

- Flow: From health issue or standalone → Select cow → Medication → Dosage & cost → Vet visit? → Save
- System: Auto-calculates withdrawal end dates (milk + meat)

### 3.3 Understanding Withdrawal Periods (`withdrawal-periods`)

- Flow: Treatment → System calculates withdrawal end → Milk flagged → Period ends → Milk safe
- Decision: "Withdrawal over?" → Yes: badge removed → No: discard warning

### 3.4 Resolving a Health Issue (`resolving-health-issue`)

- Flow: Open Issues → Select → Change status to Resolved → Done
- Tips: Resolution time tracked for analytics, recurrence within 60 days counted

---

## Phase 4: Breeding Topics (7 topics)

### 4.1 Breeding Lifecycle Overview (`breeding-lifecycle`)

Full cycle diagram in `BreedingLifecycleView`:
- Main: Heat → Insemination → Preg Check → Positive → Dry Off → Calving → Recovery → Heat (repeat)
- Branch: Preg Check Negative → back to Heat Detection
- Branch: Abortion → Recovery → Heat Detection
- Branch: Missed Heat → wait for next cycle
- Edge: Repeat breeder (3+ inseminations without conception)

### 4.2 Logging Heat Detection (`logging-heat`)

- Flow: Notice signs → Breeding Hub → Log → Select cow → "Heat Detection" → Save
- System: Calculates recommended insemination window
- Tips: Behavioral/physical signs to look for

### 4.3 Logging Insemination (`logging-insemination`)

- Flow: From notification or manual → Log → Select cow → AI/Bull Service → Sire info → Save
- System: Calculates expected preg check + calving dates
- Decision: "AI or Bull?" → different sire fields

### 4.4 Pregnancy Check Results (`pregnancy-check`)

- Flow: From notification → Log → Select cow → "Preg Check" → Positive/Negative → Save
- Decision: Positive → system sets calving + dry-off dates; Negative → back to breeding cycle

### 4.5 Dry-Off (`dry-off`)

- Flow: From notification → Log → Select cow → "Dry Off" → Save
- Tips: ~60 days before calving, cow stops being milked

### 4.6 Logging a Calving (`logging-calving`)

- Flow: From notification → Log → Select cow → "Calving" → Details → Save
- System: Resets breeding cycle, cow becomes active for milking

### 4.7 Breeding Notifications (`breeding-notifications`)

- Flow: System generates alerts → Notifications page → See overdue/upcoming → Tap to act or dismiss
- Alert types: Overdue Heat, Upcoming Preg Check, Approaching Calving, Time to Dry Off

---

## Phase 5: Cow Management Topics (3 topics)

### 5.1 Adding a New Cow (`adding-cow`)

- Flow: Cow List → + button → Fill form → Save
- Tips: Tag number unique, breed type affects breeding calculations

### 5.2 Understanding Cow Status (`cow-status`)

- Status transition diagram: Active ↔ Dry ↔ Pregnant, any → Sold/Dead
- Explanatory (no user action flow)

### 5.3 Viewing Cow Details (`cow-details`)

- Flow: Cow List → Tap cow → Tabs (Details, Health, Breeding, Milk)
- Tips: Edit from detail, soft delete admin only

---

## Phase 6: Admin/Settings Topics (8 topics)

All topics `adminOnly: true`.

### 6.1 Managing Users (`managing-users`)

- Flow: Settings → Users → Add → Role → Permissions → Login method → Save
- Decision: Admin (password) vs Worker (PIN)

### 6.2 Managing Breed Types (`managing-breed-types`)

- Flow: Settings → Breed Types → Add/Edit → Name + gestation/heat days → Save
- Tips: Can't delete if cows use it, code auto-generated

### 6.3 Managing Issue Types (`managing-issue-types`)

- Flow: Settings → Issue Types → Add/Edit → Name + emoji → Save
- Tips: Can't delete if referenced, code auto-generated

### 6.4 Managing Medications (`managing-medications`)

- Flow: Settings → Medications → Add/Edit → Name + withdrawal days + cost → Save
- Tips: Withdrawal days drive alert system, deactivate don't delete

### 6.5 Feature Flags (`feature-flags`)

- Flow: Settings → Feature Flags → Toggle → Immediate effect
- Lists each flag with description

### 6.6 Farm Settings (`farm-settings`)

- Flow: Settings → Farm Settings → Edit name/language → Save

### 6.7 Running Reports (`running-reports`)

- Flow: Settings → Reports → Select type → Date range → Format → Download
- Lists each report type with one-line description

### 6.8 Audit Log (`audit-log`)

- Flow: Settings → Audit Log → Filter → View changes
- Tips: Tracks all CUD actions, shows old vs new values

---

## Files Summary

| File | Type | Phase |
|------|------|-------|
| `client/src/components/molecules/FlowDiagram.vue` | New | 1 |
| `client/src/config/helpTopicData.js` | New | 1-6 |
| `client/src/views/HelpLibraryView.vue` | New | 1 |
| `client/src/views/HelpTopicView.vue` | New | 1 |
| `client/src/views/help/BreedingLifecycleView.vue` | New | 1+4 |
| `client/src/views/ProfileView.vue` | Modified | 1 |
| `client/src/router/index.js` | Modified | 1 |
| `client/src/i18n/en.json` | Modified | 1-6 |
| `client/src/i18n/af.json` | Modified | 1-6 |

## Testing

- `FlowDiagram.test.js` — renders nodes by type, connections, empty props
- `HelpLibraryView.test.js` — categories render, admin filtering, links work
- `HelpTopicView.test.js` — sections render for known topic, handles unknown slug

~15-20 tests total.

## i18n Estimate

~400-500 new keys per locale, added incrementally per phase.
