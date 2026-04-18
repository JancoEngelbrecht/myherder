# Plan: Animal tag re-use on delete + sync tombstone bounding

## Problem

Farmer creates animal with tag `A123` by mistake, deletes it, tries to re-create `A123` — gets 500 error from DB duplicate-key.

Cause: `UNIQUE(farm_id, tag_number)` index at DB level does not filter `deleted_at`. Soft-deleted rows keep occupying the tag slot. App-level duplicate check at [animals.ts:415](../server/routes/animals.ts#L415) filters `deleted_at`, so validation passes, then INSERT hits the constraint.

Secondary: `/api/sync/pull` returns every soft-deleted ID for the farm on every incremental sync ([syncService.ts:546-549](../server/services/syncService.ts#L546-L549)) — unbounded payload growth.

## Scope

**In scope:**

- `DELETE /api/animals/:id` — rename `tag_number` to `<tag>__del_<unix_ts>` in same UPDATE that sets `deleted_at`. Free tag slot immediately.
- `POST /api/animals/batch-delete` — same rename per animal in single bulk UPDATE.
- Wrap animal UPDATE + audit log insert in one transaction (eliminate audit-dropped-on-crash silent failure).
- Sync tombstone query — bound by `since` when incremental, so only recent deletions returned.
- Tests for re-create works after delete + sync tombstone bounded.

**Out of scope:**

- Hard delete (analyzed, rejected — sync gap + pedigree FK + audit orphan cost too high vs benefit).
- Restore/undelete admin feature (no user ask; deleted_at can be cleared manually if needed).
- Migration to change UNIQUE constraint — no schema change needed.
- Frontend changes — user-visible behavior unchanged (same toast, same list refresh).
- i18n — no new strings.
- Cleanup job for very old deleted rows — can add later if needed.

**Assumptions:**

- `tag_number` column is varchar(255) — Knex `.string()` default ([002_create_cows.js:4](../server/migrations/002_create_cows.js#L4)). Rename pattern `<tag>__del_<10-digit-ts>` fits.
- Sync clients without `since` param (full pull) still get all tombstones — backward compatible.
- Audit log table has no FK to animals ([025_create_audit_log.js:7](../server/migrations/025_create_audit_log.js#L7) entity_id is string(36)). Audit rows survive unchanged.
- No other code reads `tag_number` off rows with `deleted_at IS NOT NULL` — verified: all animal queries filter `whereNull('deleted_at')`.

**What already exists:**

- `findAnimalOrFail()` helper
- `requireAdmin` middleware
- `logAudit()` helper
- Knex `db.transaction()` wrapper
- Existing test fixtures: `createAnimal()`, `adminToken()`, `workerToken()`
- Sync test file with tombstone test case at [sync.test.ts:591-605](../server/tests/sync.test.ts#L591-L605)

## Tasks

- [ ] **Task 1: Rename tag on single delete + wrap in transaction**
  - Complexity: S
  - Files: `server/routes/animals.ts`
  - What: Modify `DELETE /api/animals/:id` at line 579. Build new tag `${oldTag}__del_${Date.now()}`. Single transaction wrapping `UPDATE animals SET deleted_at, tag_number` + `logAudit` call. Guard: if original tag already contains `__del_` (double-delete protection — shouldn't happen since animal is filtered by deleted_at already, but defensive).
  - Depends on: nothing
  - Verify: manual curl — delete animal, re-create with same tag, both succeed; `tag_number` in DB for deleted row contains `__del_`

- [ ] **Task 2: Rename tag in batch delete**
  - Complexity: S
  - Files: `server/routes/animals.ts`
  - What: Modify `POST /api/animals/batch-delete` at line 482. For each id, compute new tag. Use single UPDATE with `CASE WHEN id = ? THEN ? ELSE tag_number END` OR N-UPDATE loop inside transaction (simpler). Keep audit loop. Transaction already present.
  - Depends on: nothing (parallel to Task 1 conceptually; keep sequential for easier review)
  - Verify: manual curl — batch delete 3 animals, re-create with original tags, all succeed

- [ ] **Task 3: Bound sync tombstone query**
  - Complexity: XS
  - Files: `server/services/syncService.ts`
  - What: At line 548 add `.where('deleted_at', '>', since)`. The `since` variable already exists (function param). No other change.
  - Depends on: nothing
  - Verify: unit test — animal deleted before `since` NOT in tombstone list; deleted after `since` IS in list

- [ ] **Task 4: Update existing backend tests for new behavior**
  - Complexity: S
  - Files: `server/tests/animals.test.ts`
  - What: Existing DELETE and batch-delete tests assert `whereNotNull('deleted_at')` — still pass. Add assertion: deleted animal's `tag_number` contains `__del_`. No existing tests should fail.
  - Depends on: Tasks 1, 2
  - Verify: `npm test -- --testPathPattern=animals` passes

- [ ] **Task 5: New test — tag re-use after delete**
  - Complexity: S
  - Files: `server/tests/animals.test.ts`
  - What: Three scenarios:
    1. Single: create tag X, delete, re-create tag X → 201
    2. Batch: create 3 tags, batch-delete all 3, batch-create with same 3 tags → 201
    3. Two deletes of same tag (create X, delete, create X again, delete again) → both `__del_` suffixes are distinct (different timestamps), both rows exist
  - Depends on: Tasks 1, 2
  - Verify: test passes; check rows in DB with `.whereRaw('tag_number LIKE ?', ['%__del_%'])` — count = 2 for scenario 3

- [ ] **Task 6: New test — sync tombstone bounded by `since`**
  - Complexity: S
  - Files: `server/tests/sync.test.ts`
  - What: Insert animal with `deleted_at = 2020-01-01`. Pull with `since=2025-01-01`. Assert animal NOT in `deleted` array. Pull with `since=2019-01-01`. Assert IS in array.
  - Depends on: Task 3
  - Verify: test passes

- [ ] **Task 7: Update CLAUDE.md API docs**
  - Complexity: XS
  - Files: `CLAUDE.md`
  - What: Under `DELETE /api/animals/:id` note "soft-delete renames tag_number to free slot for re-use". Under sync section note tombstone bounding.
  - Depends on: Tasks 1, 2, 3
  - Verify: grep CLAUDE.md — no stale claims

## Architecture

### Data flow

```
DELETE /api/animals/:id (admin)
    │
    ▼
  findAnimalOrFail(id, farmId)  ── 404 if gone
    │
    ▼
  BEGIN TRANSACTION
    │
    ├── UPDATE animals
    │      SET deleted_at = NOW(),
    │          tag_number = tag_number || '__del_' || unix_ts
    │    WHERE id = ? AND farm_id = ?
    │
    └── INSERT audit_log { action: 'delete', entity_id: id, oldValues }
    │
    ▼
  COMMIT
    │
    ▼
  res.json({ message: 'Animal deleted' })
```

```
POST /api/animals/batch-delete (admin)
    │
    ▼
  Validate ids exist + farm-scoped (404 if any missing)
    │
    ▼
  BEGIN TRANSACTION
    │
    ├── For each id in ids:
    │      UPDATE animals
    │        SET deleted_at = NOW(),
    │            tag_number = tag_number || '__del_' || unix_ts
    │      WHERE id = ? AND farm_id = ?
    │
    └── For each id: INSERT audit_log
    │
    ▼
  COMMIT
    │
    ▼
  res.json({ deleted: ids.length })
```

```
GET /api/sync/pull?since=<ISO>
    │
    ▼
  pullData(since, full, farmId, user)
    │
    ▼
  For each entity table:
    │
    ├── if incremental + softDelete:
    │      SELECT id FROM <table>
    │       WHERE farm_id = ?
    │         AND deleted_at IS NOT NULL
    │         AND deleted_at > since          ── NEW
    │
    └── return deleted[]
```

### Key decisions

- **Rename in-place vs new column.** Picked in-place. Pros: no migration, uses existing UNIQUE index correctly, one-shot UPDATE. Cons: original tag is mangled in soft-deleted row — can be recovered by stripping `__del_<ts>` suffix if ever needed.
- **Timestamp unit: `Date.now()` (ms) vs unix seconds.** Milliseconds. Two rapid deletes of same tag must produce distinct suffixes — ms collision vanishingly rare even in tests.
- **Transaction wrap for audit.** Wrap. Silent audit-loss on DB hiccup is the one tail risk of soft-delete model. Tiny cost (~1ms), removes the risk.
- **Sync bound uses `since` direct.** No grace period. Clients reconciling late (e.g. came online after 6 months) get fewer tombstones — but they must do a full pull anyway after long offline period. Acceptable.
- **Backward compat.** Clients with no `since` (full pull path) take a different branch in [syncService.ts](../server/services/syncService.ts) — unaffected.

### Pattern reference

Follows existing soft-delete pattern on animals. Same file, same route, same audit helper. No new abstractions.

## Test Matrix

| Codepath / Flow                     | Happy path                                       | Error path                                 | Edge case                           | Test exists?                   |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------ | ----------------------------------- | ------------------------------ |
| DELETE orphan animal                | deleted_at set, tag renamed                      |                                            | same tag re-creatable after delete  | [ ] new                        |
| DELETE animal with treatments       | deleted_at set, tag renamed (children untouched) |                                            | child FK still valid                | [ ] new                        |
| DELETE non-admin                    |                                                  | 403                                        |                                     | [x] existing                   |
| DELETE not found                    |                                                  | 404                                        |                                     | [x] existing                   |
| DELETE cross-farm id                |                                                  | 404                                        |                                     | [x] existing                   |
| DELETE + audit insert fails         |                                                  | transaction rolls back, animal NOT deleted |                                     | [ ] deferred (hard to trigger) |
| batch-delete 3 orphans              | all soft-deleted, all tags renamed               |                                            | re-create all 3 tags succeeds       | [ ] new                        |
| batch-delete with one ID missing    |                                                  | 404 (all-or-nothing)                       |                                     | [x] existing                   |
| batch-delete empty ids              |                                                  | 400                                        |                                     | [x] existing                   |
| batch-delete >500 ids               |                                                  | 400                                        |                                     | [x] existing                   |
| Sync pull `since` older than delete | tombstone returned                               |                                            |                                     | [x] existing                   |
| Sync pull `since` newer than delete | tombstone NOT returned                           |                                            | boundary: `since == deleted_at`     | [ ] new                        |
| Sync pull full=1                    | all tombstones always returned                   |                                            |                                     | [x] existing                   |
| Double-delete same tag              | two distinct `__del_<ts>` suffixes               |                                            | ms collision impossible in practice | [ ] new                        |

## Failure Modes

| Codepath                    | Failure scenario                                 | Covered by test?               | Error handling?                                          | Silent failure?                   |
| --------------------------- | ------------------------------------------------ | ------------------------------ | -------------------------------------------------------- | --------------------------------- |
| UPDATE animals (rename tag) | tag already >255 chars (existing tag near limit) | No                             | DB truncate error → transaction rollback → user sees 500 | Maybe — depends on MySQL sql_mode |
| UPDATE animals              | animal deleted concurrently by another admin     | No                             | Row count check post-UPDATE; if 0 rows → 404             | No — existing pattern             |
| Audit insert                | DB hiccup mid-transaction                        | No                             | Transaction rolls back both                              | No — fixed by wrap                |
| Batch UPDATE                | one UPDATE fails mid-loop                        | No                             | Transaction rolls back all                               | No                                |
| Sync tombstone              | client sends malformed `since`                   | No (validated upstream by Joi) | 400 validation error                                     | No                                |
| Sync tombstone              | `since` exactly equals `deleted_at`              | Yes (boundary test)            | `>` is strict → row NOT returned                         | No — documented                   |

**Critical gaps:**

- Tag length overflow. `varchar(255)` with input tag up to 50 (Joi limit) + `__del_` (6) + ms timestamp (13) = 69 chars. Well under 255. No gap.
- `since == deleted_at` boundary. Strict `>` means client misses a deletion that happened exactly at its last-sync timestamp. In practice `since` is a round-trip echo of the server's `syncedAt` — collision means the delete happened in the same ms as the prior sync response. Vanishingly rare. If it does happen, animal remains in client IDB until next delete on server bumps the sync window. Acceptable.

## Performance

- Single UPDATE per delete instead of prior single UPDATE — no change.
- Batch: N UPDATEs in one transaction. For 500 animals, ~500ms on SQLite dev, ~100ms on MySQL. Acceptable. Alternative: single UPDATE with `CASE WHEN` — harder to read, marginal gain.
- Sync tombstone query: was unbounded (full table scan on soft-deleted rows), now bounded by `since`. Improvement for any farm with history.
- New index needed? Existing `animals(farm_id, deleted_at)` index (if present — verify) or add `(farm_id, deleted_at)` composite. Check [003_add_indexes.js](../server/migrations/003_add_indexes.js) or 026_add_missing_indexes.

## Risks & Open Questions

1. **Double-delete timestamp collision.** `Date.now()` in ms — two deletes of same tag within 1 ms = same suffix = UNIQUE violation on second delete. Mitigation: append short random suffix (`__del_<ms>_<random4>`) or use `Date.now()` + auto-increment. Low prob, fix if ever hit.
2. **Audit transaction wrap** — first place in codebase to wrap audit inside route transaction. Verify `logAudit` accepts optional `trx` param. If not, Task 1 has to either modify helper or inline the insert. Check before Task 1.
3. **Existing deleted rows** — farms with existing soft-deleted animals (pre-change) will have tag slots locked until re-deleted. Acceptable — no data loss, admin can manually clear via DB if needed.
4. **Sync behavior for clients with stale `since`** — client offline for 6 months with local IDB containing now-deleted animal that was deleted 5 months ago will no longer receive tombstone. Falls back to full pull by design when `full=1` is sent. Frontend logic: confirm clients use `full=1` after extended offline. Out of scope to change now.
