---
name: quality-gates
description: Load between implementation phases or after completing code changes. Provides a fast, focused quality checklist — dead code, security, readability, effectiveness, and test quality.
---

# Quality Gates

A fast quality checklist to run after implementing code changes. Not a full audit — this is a focused scan to catch the most common issues before moving on.

## When to Run

- After completing a phase in `/develop`
- After any significant implementation before committing
- When the @builder finishes a task and self-reviews

## The 5 Gates

Run these in order. Fix issues as you find them — don't collect a list and fix later.

### Gate 1: Dead Code

Scan all changed files for:

- [ ] Unused imports (imported but never referenced)
- [ ] Unused variables or constants
- [ ] Unreachable code (after return/throw, impossible conditions)
- [ ] Commented-out code blocks (delete them — git has history)
- [ ] Unused function parameters (prefix with `_` if intentionally unused)
- [ ] Orphaned exports (exported but nothing imports them)

**Action**: Delete dead code immediately. Don't comment it out.

### Gate 2: Security

Scan all changed files for:

- [ ] SQL injection (string concatenation in queries — must use parameterized bindings)
- [ ] Missing input validation (new API endpoints without Joi schemas)
- [ ] Auth gaps (routes missing auth/authorize middleware)
- [ ] Ownership checks (can user A access/modify user B's data?)
- [ ] Data exposure (returning password hashes, tokens, or internal errors to client)
- [ ] XSS risks (v-html, innerHTML with user-provided content)
- [ ] Hardcoded secrets (API keys, passwords, JWT secrets in code)

**Action**: Fix security issues immediately. These are never "nice to have".

### Gate 3: Readability

Scan all changed files for:

- [ ] Functions longer than 30 lines → extract into named functions
- [ ] Nesting deeper than 3 levels → use guard clauses / early returns
- [ ] Unclear variable/function names → rename to describe intent
- [ ] Magic numbers or strings → extract to named constants
- [ ] Missing "why" comments on non-obvious logic (don't comment the "what")
- [ ] Inconsistent patterns → match the conventions of surrounding code

**Action**: Refactor only if the improvement is clear. Don't gold-plate.

### Gate 4: Effectiveness

Review the actual behavior of changed code:

- [ ] Does the code actually solve the stated problem?
- [ ] Are error states handled gracefully (not swallowed, not crashing)?
- [ ] Are edge cases covered (empty inputs, null values, boundary conditions)?
- [ ] Are async operations properly awaited (no fire-and-forget promises)?
- [ ] Are database queries correct (right joins, right conditions, right ordering)?
- [ ] For frontend: does the UI state update correctly on success AND failure?

**Action**: Fix logic errors. Flag anything you're uncertain about to the user.

### Gate 5: Test Quality

Review tests for changed code:

- [ ] Do tests exist for critical business logic?
- [ ] Do tests assert meaningful outcomes (not just "it didn't throw")?
- [ ] Are error paths tested (invalid input, missing data, auth failures)?
- [ ] Are tests independent (no shared state, no test ordering dependencies)?
- [ ] Do test names describe the scenario ("returns empty array when user has no orders")?
- [ ] No assertions inside loops (if loop is empty, test passes vacuously)

**Action**: Add missing tests for critical paths. Fix tests that don't assert properly.

## Quick Gate (Abbreviated)

When time is tight or changes are small, run the abbreviated version:

1. **Dead code**: Any unused imports or variables? Delete them.
2. **Security**: Any unvalidated input or missing auth? Fix immediately.
3. **Does it work**: Does the code actually do what it's supposed to? Handle errors?
4. **Tests pass**: Run the test suite. Green? Move on.

## Output

After running quality gates, briefly note:

```
Quality Gate: PASS (5/5) | PARTIAL (N issues fixed, M noted) | FAIL (blocking issues)
```

If FAIL, fix blocking issues and re-run. If PARTIAL, note the outstanding items and decide whether to fix now or flag for later.
