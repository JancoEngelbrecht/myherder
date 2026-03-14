---
description: Full feature pipeline — plan, audit plan, build, audit implementation, ship. One command to go from description to committed code.
---

Run the full development pipeline for the feature the user describes.

## Phase 1: PLAN

1. Read CLAUDE.md and MEMORY.md to understand project context
2. Break the feature into atomic, verifiable tasks using TodoWrite
3. If the plan involves libraries, APIs, or patterns not already in the codebase, launch @researcher to validate the approach (is it maintained? correct API? gotchas?)

If the plan has **more than 8 tasks**, phase-split: group into phases of 3-6 tasks each. Each phase must be independently deployable and end with a quality gate.

### Plan Audit Loop

Before showing the plan to the user, self-audit it:

4. Launch **2 parallel agents** using the @auditor persona:
   - **Agent 1 — Feasibility & Completeness:** Are all tasks atomic and verifiable? Missing steps? Implicit assumptions? Dependencies ordered correctly? Edge cases covered? Breaking changes flagged?
   - **Agent 2 — Risk & Architecture:** Does it follow existing patterns? Architectural risks? Security implications? Data loss risk? Rollback needed?
5. If the audit finds issues → refine the plan and re-audit (max 2 rounds)
6. For complex features (3+ tasks, architectural decisions, new patterns), also launch @architect to review

### Breaking Change Gate

If any task involves changing API contracts, DB schema, auth flows, or deleting exports — flag it explicitly in the plan and ensure the user approves before implementation.

### Approval

7. Show the final plan to the user with a summary of what the audit checked
8. **Wait for user approval** before continuing

**Gate:** User approves the plan.

## Phase 2: BUILD

1. Load relevant skills (mandatory — check CLAUDE.md for available skills)
2. Implement each task in order using the @builder approach:
   - Read relevant code before editing
   - One change at a time
   - Self-review after every change
   - Run tests after each meaningful change
3. Mark each task complete as it's done
4. After all tasks are complete, run the full test suite and lint

**Gate:** All tests pass and lint is clean.

### Quality Gate (per phase, if phase-split)

After completing each phase, run a quick quality check:
1. **Dead code** — unused imports, variables, unreachable branches, commented-out code
2. **Security** — injection risks, auth gaps, input validation, data exposure
3. **Readability** — naming, complexity, nesting depth, function length
4. **Effectiveness** — does the code actually solve the problem? Edge cases handled?

Fix any issues found. Re-run tests after fixes. Do NOT proceed to the next phase until the quality gate passes.

## Phase 3: AUDIT & FIX

Audit the implementation, fix issues, and re-audit. This runs at least 2 rounds to ensure quality.

### Round 1

1. Launch **3 parallel @auditor agents** (category mode):
   - Agent 1: Correctness & Safety (SAFETY checklist, happy path, error paths)
   - Agent 2: Quality & Efficiency (QUALITY + EFFICIENCY checklists, patterns)
   - Agent 3: Completeness & Integration (tests, i18n, Joi schemas, dead code, integration)
2. If the feature touches routes, auth, or data handling → also launch @security for threat analysis
3. Compile findings. Fix all Critical and Important issues.
4. Re-run tests.

### Round 2

5. Re-audit: launch targeted @auditor agents on changed files only
6. Fix any remaining Critical or Important findings
7. Re-run tests

### Round 3+ (if needed, max 4 total)

8. If there are still Critical findings after Round 2, continue the loop (audit → fix → test)
9. Stop after 4 rounds regardless — report any remaining issues

**Gate:** No Critical findings remain. Tests pass.

## Phase 4: SHIP

Run the `/ship` checklist:
1. Final test run
2. Code standards check
3. @auditor diff review
4. Reality check (skeptical — trace the full user flow, check for implicit assumptions, flag breaking changes)
5. Commit with conventional commit message

## Output

After completing (or stopping), report:

```
# Development Report — [Feature Name]

## Result: SHIPPED / BLOCKED AT [PHASE]

## What was built
- [Bullet summary of changes]

## Files changed
- [List of files with brief description of changes]

## Quality
- Tests: [pass/fail count]
- Audit rounds: [how many, final verdict]
- Security: [any findings from @security]
- Reality check: [any concerns addressed]

## Notes
[Anything the user should know — breaking changes, follow-up work, decisions made]
```

## Rules

- **Never skip Phase 1 approval** — always wait for the user to approve the plan
- **Stop on test failures** — don't push through broken tests
- **Minimum 2 audit rounds** — even if Round 1 is clean, Round 2 confirms
- **Max 4 audit rounds** — if still failing after 4, stop and report
- **Don't gold-plate** — build what was asked for, nothing more
- **Load skills** — mandatory, not suggestions
- **Keep the user informed** — report status at each phase transition
- **Respect existing patterns** — read before writing, follow what's already there
- **Security is not optional** — @security runs on any feature touching routes, auth, or data
- **Don't change API contracts** without user approval
- **Don't add new dependencies** without user approval
- **Ask when blocked** — if a design decision is needed, ask the user rather than guessing
