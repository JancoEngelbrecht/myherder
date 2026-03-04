---
description: Autonomous code audit loop — audit, plan, implement, re-audit until all categories score 90%+.
---

Run an autonomous code quality improvement loop. The goal is to bring all 6 audit categories to 90/100 or above.

## Categories

| # | Category | Key |
|---|---|---|
| 1 | Safety & Security | SAFETY |
| 2 | Code Efficiency | EFFICIENCY |
| 3 | Code Quality | QUALITY |
| 4 | Human Readability | READABILITY |
| 5 | Dead Code Cleanliness | DEADCODE |
| 6 | Code Effectiveness | EFFECTIVENESS |

## Phase 1: AUDIT

Launch **4 parallel agents** using the @auditor agent persona. Group the 6 categories into 4 agents for efficiency:

- Agent 1: **SAFETY** audit
- Agent 2: **EFFICIENCY** audit
- Agent 3: **QUALITY + READABILITY** audit (report two separate scores)
- Agent 4: **DEADCODE + EFFECTIVENESS** audit (report two separate scores)

Each agent prompt MUST include:
1. The category name and checklist from the @auditor agent definition
2. The project context: "This is an Express + Vue 3 + Knex (SQLite/MySQL) app with JWT auth, offline sync, and PWA support"
3. Instruction to read CLAUDE.md and MEMORY.md first for project conventions
4. Instruction to check key files relevant to their category
5. Instruction to end with a numeric score and top 3 fixes

After all agents complete, compile a **scorecard**:

```
| Category      | Score | Status    |
|---------------|-------|-----------|
| SAFETY        | XX    | PASS/FAIL |
| EFFICIENCY    | XX    | PASS/FAIL |
| QUALITY       | XX    | PASS/FAIL |
| READABILITY   | XX    | PASS/FAIL |
| DEADCODE      | XX    | PASS/FAIL |
| EFFECTIVENESS | XX    | PASS/FAIL |
```

PASS = 90+, FAIL = below 90.

If ALL categories PASS → skip to Phase 6 (report).
If any FAIL → continue to Phase 2.

## Phase 2: PLAN

From all FAIL categories, collect every finding and rank by impact. Select the **top 3-5 highest-impact fixes** that will move scores the most.

**Breaking Change Gate:** Before proceeding, check if ANY planned fix involves:
- Changing API response shapes (adding/removing/renaming fields)
- Database schema changes (migrations)
- Modifying authentication or authorization flows
- Deleting exported functions/components that other code imports
- Changing sync protocol behavior

If YES to any: **STOP and ask the user** for approval, listing specifically what will change and why. Wait for confirmation before proceeding.

If NO breaking changes: proceed autonomously.

Create a focused fix plan as a todo list:
```
1. [Category] Fix description — file(s) affected
2. [Category] Fix description — file(s) affected
3. ...
```

## Phase 3: IMPLEMENT

For each fix in the plan:

1. Read the target file(s) in full
2. Make the minimal change needed — don't refactor surrounding code
3. Follow existing patterns (check CLAUDE.md conventions)
4. If the fix touches backend routes, ensure Joi schemas are updated
5. If the fix touches frontend, ensure i18n keys exist in both en.json and af.json

After implementing all fixes, mark each todo as complete.

## Phase 4: VERIFY

Run the project's test suites:
```bash
cd server && npm test
cd client && npm run test:run
npm run lint
```

If tests fail:
- Read the failure output
- Fix the regression (don't skip or delete the test)
- Re-run until green

If lint fails:
- Run `npm run lint:fix`
- If issues remain, fix manually

Do NOT proceed to Phase 5 until all tests pass and lint is clean.

## Phase 5: RE-AUDIT

### Targeted re-audit
For each category that was FAIL, launch a **targeted** @auditor agent that:
- Only examines files that were changed in Phase 3
- Re-scores the category
- Reports any NEW issues introduced by the fixes

### Cross-category regression check
Launch ONE additional @auditor agent with this prompt:
> "Quick regression check: review these changed files [list] across ALL 6 categories. Only report findings of BUG or RISK severity. Score each category based on whether the changes improved, degraded, or had no effect on that category."

### Update scorecard
Merge the targeted scores with unchanged category scores. Display updated scorecard.

### Loop decision
- If ALL categories >= 90 → proceed to Phase 6
- If iteration count >= 5 → proceed to Phase 6 (safety cap) with a note about remaining issues
- Otherwise → go back to Phase 2 with the updated findings

## Phase 6: REPORT

Display the final report:

```
# Code Audit Report — Iteration N

## Final Scorecard
| Category      | Start | Final | Delta |
|---------------|-------|-------|-------|
| SAFETY        | XX    | XX    | +XX   |
| ...           |       |       |       |

## Fixes Applied (N total across M iterations)
1. [Category] Description — files changed
2. ...

## Remaining Issues (if any categories < 90)
- [Category] Issue description — why it wasn't fixed

## Breaking Changes Made
- None / [list if any were approved by user]

## Test Results
- Backend: XXX tests passing
- Frontend: XXX tests passing
- Lint: clean / N warnings
```

Update MEMORY.md with the audit results if scores changed significantly.

## Rules

- **Max 5 iterations** — if scores plateau, stop and report what's left
- **Max 5 fixes per iteration** — keep batches small and reviewable
- **Never skip tests** — Phase 4 is mandatory, no shortcuts
- **Don't fix SUGGESTION-level issues** until all BUG and RISK issues are resolved
- **Don't change API contracts** without user approval (this is a breaking change)
- **Don't add new dependencies** without user approval
- **Preserve existing test count** — fixes should not reduce test coverage
- **Update CLAUDE.md** if you add/change any API endpoints
- **Update MEMORY.md** with audit status when done
