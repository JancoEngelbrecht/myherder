# Remove Milk Session Tabs — Derive Session from Time

## Context

Today the MilkRecordingView forces the farmer to pick Morning / Afternoon / Evening tabs before entering milk litres. This is confusing — the time of day is already captured in `session_time`, so the session label can be derived automatically.

**Goal:** Remove the session selector UI. Keep the `session` concept in the database, backend, store, and analytics (still useful to group totals by morning/afternoon/evening). Derive it from `selectedTime` at the view layer only.

**Key architectural decision:** The session pipeline (DB column, Joi schema, store state, uniqueness constraint, history filters, analytics) **stays exactly as it is**. The only change is that `MilkRecordingView` computes `selectedSession` from `selectedTime` instead of asking the farmer to click a tab.

**Not in scope:** No DB migration. No backend changes. No store contract changes. No removal of session filters in MilkHistoryView. No changes to analytics.

## Derivation rule

A single helper used only by the view layer:

```ts
// client/src/utils/milkSession.ts
export function deriveSession(timeStr: string): 'morning' | 'afternoon' | 'evening' {
  const h = Number(timeStr.slice(0, 2))
  if (h < 11) return 'morning' // 00:00–10:59
  if (h < 16) return 'afternoon' // 11:00–15:59
  return 'evening' // 16:00–23:59
}
```

Boundaries chosen so the existing default times (06:00 / 12:00 / 18:00) land in the intended bucket.

## Important facts verified in audit

- The milk_records uniqueness check is on `(animal_id, session, recording_date, session_time)` — see [server/routes/milkRecords.ts:242-247](server/routes/milkRecords.ts#L242-L247). Two records in the same derived session are fine as long as `session_time` differs. **No conflict risk from this change.**
- The store ([client/src/stores/milkRecords.ts:13](client/src/stores/milkRecords.ts#L13)) keys records as `Record<animal_id, row>` — one record per animal for the currently viewed session. Keeping `fetchSession(date, session)` preserves this model exactly.
- `currentSession` + `currentDate` in the store back a stale-write guard at [line 223](client/src/stores/milkRecords.ts#L223) — they keep working unchanged because the view still passes a session down.
- MilkHistoryView's session filter chips are staying — farmers find them useful for browsing historical data.

## Phase 1 — Client-side helper

**File:** `client/src/utils/milkSession.ts` _(new)_

- Export `deriveSession(timeStr)` with the rule above.
- Export `DERIVED_SESSIONS = ['morning', 'afternoon', 'evening'] as const` for type safety.
- Guard against malformed input: if `timeStr` is empty or doesn't match `HH:MM`, return `'morning'` (safe default matching the 00:00 bucket).

**Test file:** `client/src/tests/milkSession.test.ts` _(new)_

- Boundary tests: `00:00` → morning, `10:59` → morning, `11:00` → afternoon, `15:59` → afternoon, `16:00` → evening, `23:59` → evening.
- Malformed input tests: `''`, `'bad'`, `null` (cast) → morning.

## Phase 2 — MilkRecordingView (the only view change)

**File:** [client/src/views/MilkRecordingView.vue](client/src/views/MilkRecordingView.vue)

### 2.1 Template

- **Delete** the `<!-- Session tabs -->` block, [lines 18-29](client/src/views/MilkRecordingView.vue#L18-L29), including the `data-tour="milk-session"` attribute.
- **Update** the time-row: add a derived session badge next to the time input so the farmer can see which session their current time falls into.
  ```vue
  <div class="time-row">
    <label class="control-label">{{ t('milkRecording.sessionTime') }}</label>
    <input v-model="selectedTime" type="time" class="form-input time-input" />
    <span class="derived-session-badge">→ {{ t(`milkRecording.${selectedSession}`) }}</span>
  </div>
  ```
- Keep the existing `.time-hint` span or remove it — the badge replaces its role. Decision: **remove** the hint since the badge is more informative.

### 2.2 Script

- **Import** `deriveSession` from `../utils/milkSession`.
- **Delete:** `sessions` array, `sessionDefaultTimes` object, `setSession()` function.
- **Change** `selectedSession` from a `ref('morning')` to a `computed(() => deriveSession(selectedTime.value))`.
- **Keep** `handleUpdate()` exactly as-is — it already reads `selectedSession.value` and passes it to the store. The computed's `.value` is identical at the call site.
- **Simplify** `onDateChange()`: it currently re-applies the session default time. New body: `selectedTime.value = isToday.value ? roundToQuarter() : '06:00'`. (The watcher handles reloading.)
- **Watcher stays identical:** `watch([selectedDate, selectedSession], loadRecords)`. Because `selectedSession` is now a computed that tracks `selectedTime`, changing the time across an 11:00 or 16:00 boundary automatically triggers a reload — exactly the behaviour we want.
- **Tour array:** remove the `milk-session` step at [lines 248-254](client/src/views/MilkRecordingView.vue#L248-L254). Leave the other three steps (`milk-search`, `milk-entries`, `milk-history`) untouched.

### 2.3 Styles

- **Delete** `.session-tabs` and `.session-tab` rules, [lines 334-359](client/src/views/MilkRecordingView.vue#L334-L359).
- **Add** `.derived-session-badge`: small pill-style label, uses `var(--primary)` color, mono font, subtle background. Matches the existing design tokens from [style.css](client/src/style.css).
- **Remove** the `.time-hint` rule if the hint element was removed in 2.1.

### 2.4 View tests

**File:** [client/src/tests/MilkRecordingView.test.ts](client/src/tests/MilkRecordingView.test.ts)

- **Remove** any assertions about session tabs being rendered or clicked (grep for `session-tab`, `setSession`, `morning/afternoon/evening` button queries).
- **Add** tests:
  1. `"shows derived session badge matching current time"` — mount with time `07:00`, assert badge text matches `milkRecording.morning`.
  2. `"updates badge when time changes"` — update `selectedTime` to `14:00`, assert badge text changes to `milkRecording.afternoon`.
  3. `"passes derived session to store on save"` — set time to `19:30`, call handleUpdate, assert `milkStore.autoSave` was called with `'evening'` as the session arg.

## Phase 3 — i18n

**Files:** [client/src/i18n/en.json](client/src/i18n/en.json), [client/src/i18n/af.json](client/src/i18n/af.json)

- **Keep** `milkRecording.morning`, `milkRecording.afternoon`, `milkRecording.evening` — now used by the derived session badge AND still used by MilkHistoryView card labels. Do not remove.
- **Remove** `tour.milkRecording.session.title` and `tour.milkRecording.session.desc` from both files.
- **Remove** `milkRecording.sessionTimeHint` from both files if removed from the template in 2.1. Grep to confirm no other view uses it before deleting.

## Phase 4 — Verification

- `cd client && npm run test:run` — frontend. Must include the new helper test + updated view tests.
- `npm test` — backend. No changes expected; just sanity check nothing broke.
- `npm run lint:fix && npm run format`
- Manual smoke test:
  1. Navigate to Milk Recording.
  2. Confirm no session tabs visible. Time input shows current rounded time with a derived-session badge next to it.
  3. Record a cow at 07:00 → check GET `/api/milk-records?date=X&session=morning` returns the new record.
  4. Change time to 14:00 → badge flips to "Afternoon", list reloads to show afternoon entries (empty on first run).
  5. Record a cow at 14:00 → appears in afternoon session.
  6. Change time to 19:00 → badge flips to "Evening", list reloads.
  7. Open MilkHistoryView → confirm session filter chips still work and session labels still render on cards.
- `npm run build` — regenerate client/dist for deploy.

## Risk notes

- **Offline clients:** No risk. The backend contract and store contract are unchanged. Stale client bundles that still show the old tabs will continue working until the user refreshes.
- **Uniqueness conflicts:** No new risk. The uniqueness key includes `session_time`, so the farmer could always record multiple entries per session and still can.
- **Time crossing a boundary mid-save:** A farmer enters 10:58, starts typing litres (debounced save pending), then changes the time to 11:02 before the save fires. The store's `flushPending()` (called at fetchSession start) ensures the pending write completes under the original morning session before reloading for afternoon. Existing safety rail — no new risk.
- **Tour regression:** The tour has 4 steps today. Dropping the session step to 3 is a visual change only. TourButton and useTour composable need no updates.

## Files touched (total: 6 + 1 new)

1. `client/src/utils/milkSession.ts` _(new)_
2. `client/src/tests/milkSession.test.ts` _(new)_
3. `client/src/views/MilkRecordingView.vue`
4. `client/src/tests/MilkRecordingView.test.ts`
5. `client/src/i18n/en.json`
6. `client/src/i18n/af.json`
7. `client/dist/*` (build artifacts, regenerated)

**Zero backend changes. Zero store changes. Zero migration.**
