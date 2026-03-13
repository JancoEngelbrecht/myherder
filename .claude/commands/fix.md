---
description: Fix issues from an audit report or user-identified problems. Applies minimal, safe fixes that do not break existing functionality.
---

Fix the issues identified by the user or from a prior `/audit` report. Use the @builder agent for all implementation work.

**When invoked after `/audit`:** The audit findings from the current conversation carry over — do not re-audit. Pick up the Critical and Important findings directly and proceed to Step 1.

## Principles

- **Do not break existing code.** Every fix must preserve existing behavior for all code paths not directly related to the issue.
- **Only fix real issues.** A finding is a real issue if it is currently broken (BUG), creates a concrete risk under realistic conditions (RISK), or violates an explicit project convention in CLAUDE.md. Do NOT fix style preferences, hypothetical concerns, or SUGGESTION-level findings unless the user specifically asks.
- **Minimal changes only.** Fix the issue and nothing else. Do not refactor surrounding code, rename variables, add comments, reorganize imports, or "improve" nearby code.
- **Follow existing patterns.** Read CLAUDE.md and the surrounding code first. Match the style, naming, and patterns already in use.

## Process

### Step 1: IDENTIFY
Determine what to fix:
- If the user points to specific issues → fix those
- If referencing a prior `/audit` report → fix Critical findings first, then Important. Skip Minor unless explicitly asked.
- If unclear → ask the user what they want fixed

List the fixes to be applied:
```
1. [Severity] Description — file(s) affected
2. ...
```

### Step 2: IMPACT CHECK
Before writing any code, verify for each fix:
- [ ] Does this change any API response shapes? (fields added/removed/renamed)
- [ ] Does this change any database schema?
- [ ] Does this change authentication or authorization flows?
- [ ] Does this delete or rename any exported function/component/constant?
- [ ] Does this change sync protocol or offline behavior?

If YES to any → **STOP and ask the user** for approval before proceeding. Explain what will change and why.

### Step 3: IMPLEMENT
For each fix, using the @builder agent:
1. Read the target file(s) in full
2. Understand the current behavior — trace the code path
3. Make the minimal change to fix the issue
4. Ensure the fix does not alter unrelated behavior
5. If the fix touches a backend route, verify Joi schemas still match
6. If the fix touches frontend, verify i18n keys exist

### Step 4: VERIFY
Run the project's test suites:
```bash
cd server && npm test
cd client && npm run test:run
npm run lint
```

- If tests fail → determine if the failure is caused by the fix or was pre-existing
  - If caused by the fix → revert and re-approach. The fix is wrong if it breaks tests.
  - If pre-existing → note it but do not fix unrelated test failures in this pass
- If lint fails → run `npm run lint:fix`, then fix remaining issues manually

**Do NOT proceed until tests pass.**

### Step 5: REPORT
```
# Fix Report

## Fixes Applied
1. [Severity] Description — file(s) changed
   What was wrong: [concrete description]
   What was changed: [minimal diff summary]
2. ...

## Fixes Skipped (if any)
- [Reason] Description — why it was skipped

## Test Results
- Backend: X tests passing
- Frontend: X tests passing
- Lint: clean / N warnings

## Regressions
- None / [describe any test changes]
```

## Rules

- **Never fix SUGGESTION-level findings** unless the user explicitly asks
- **Never refactor or improve code** beyond what the fix requires
- **Never add new dependencies** without user approval
- **Never reduce test count** — if a test needs updating, update it, don't delete it
- **Never change API contracts** without user approval
- **Revert if tests break** — a fix that breaks other things is not a fix
- **One concern per fix** — don't bundle unrelated changes together
