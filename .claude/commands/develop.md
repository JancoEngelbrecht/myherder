---
description: Autonomous develop loop — plan, audit, phase-split, implement, verify, and audit until production-quality. Eliminates manual babysitting.
---

Run an autonomous development loop from planning through implementation to verified, audited code. The goal is to produce production-quality code without manual intervention at each step.

## Inputs

- **Feature/task description** — from user message
- **Scope** — clarify before starting (ask if ambiguous)

## Phase 1: PLAN

Load the `planning` skill. Follow the planning process:

1. Read relevant code to understand current state and existing patterns
2. Clarify scope — what's in, what's out, what assumptions we're making
3. Break down into atomic tasks with acceptance criteria, complexity, and file list
4. Flag any design decisions needed before implementation

Create the plan as a TodoWrite task list.

If the plan has **more than 8 tasks**, proceed to Phase 2 (phase-splitting). Otherwise, skip to Phase 3.

## Phase 2: PHASE-SPLIT

Group tasks into phases of 3-6 tasks each. Each phase must:

- Be independently deployable (no half-finished features)
- End with a quality gate (tests pass, no dead code, no security gaps)
- Build on the previous phase

Label phases clearly:
```
Phase 1: [Name] (Tasks 1-4)
Phase 2: [Name] (Tasks 5-8)
Phase 3: [Name] (Tasks 9-11)
```

## Phase 3: AUDIT THE PLAN

Load the `audit-plan` skill. For each phase (or the full plan if not split):

1. Extract every verifiable claim (file paths, function names, API shapes, schema details)
2. Verify each claim against the actual codebase using Read, Glob, Grep
3. Fix inaccuracies in the plan directly
4. Check for missing edge cases, platform branches, rollback concerns
5. Verify dependency ordering between tasks

**Loop**: If the audit found BUG or GAP severity issues, fix and re-audit (max 2 iterations).

**Breaking Change Gate**: If any task involves changing API contracts, DB schema, auth flows, or deleting exports — STOP and ask the user for approval before proceeding.

## Phase 4: IMPLEMENT + VERIFY (per phase)

For each phase, execute this loop:

### 4a: Implement

For each task in the phase:

1. Read target files in full before editing
2. Make the change following existing patterns (check CLAUDE.md conventions)
3. Load relevant skills as needed (vue-patterns, express-patterns, knex-patterns, testing, etc.)
4. Mark each task complete in TodoWrite as you finish it

### 4b: Test

Run the project's test suites:
```bash
# Adjust commands based on project — check CLAUDE.md for exact commands
npm test
npm run lint
```

If tests fail:
- Read the failure output carefully
- Fix the regression (never skip or delete tests)
- Re-run until green

If lint fails:
- Run the lint fix command if available
- Fix remaining issues manually

Do NOT proceed until all tests pass and lint is clean.

### 4c: Quality Gate

Load the `quality-gates` skill. Run the quick quality gate on all files changed in this phase:

1. **Dead code** — unused imports, variables, unreachable branches, commented-out code
2. **Security** — injection risks, auth gaps, input validation, data exposure
3. **Readability** — naming, complexity, nesting depth, function length
4. **Effectiveness** — does the code actually solve the problem? Edge cases handled?
5. **Test quality** — do tests assert meaningful behavior? Are critical paths covered?

Fix any issues found. Re-run tests after fixes.

### 4d: Refactor Check

Quick scan for refactoring opportunities:
- Functions > 30 lines → consider extraction
- Duplicated logic across files → consider shared helper
- Deep nesting (> 3 levels) → consider guard clauses
- Magic numbers/strings → consider constants

Only refactor if the improvement is clear and significant. Don't refactor for the sake of it.

### Loop Decision

If quality gate found issues that were fixed, re-run the quality gate once more (max 2 iterations per phase). Then proceed to next phase.

## Phase 5: FINAL AUDIT

After all phases are complete, run a targeted audit across ALL changed files:

Launch **2 parallel agents** using the @auditor persona:

- Agent 1: **SAFETY + EFFECTIVENESS** audit on changed files only
- Agent 2: **QUALITY + DEADCODE** audit on changed files only

Each agent prompt must include:
1. The list of files changed during implementation
2. The category checklists from the @auditor agent
3. Instruction to read CLAUDE.md first for project conventions
4. Instruction to end with a numeric score and top 3 fixes

If any category scores below 85:
- Fix the top issues (max 3 fixes)
- Re-run tests
- Re-audit that category only (max 2 iterations)

## Phase 6: REPORT

Display the final report:

```
# Development Report

## What was built
[1-2 sentence summary]

## Phases completed
- Phase 1: [Name] — [N tasks, all passing]
- Phase 2: [Name] — [N tasks, all passing]

## Quality Scores (final)
| Category      | Score |
|---------------|-------|
| SAFETY        | XX    |
| QUALITY       | XX    |
| DEADCODE      | XX    |
| EFFECTIVENESS | XX    |

## Tests
- [Test suite]: XX tests passing
- Lint: clean / N warnings

## Files changed
- [list of files created/modified]

## Decisions made
- [any design decisions or assumptions made during implementation]

## Breaking changes
- None / [list if any were approved]
```

## Rules

- **Max 3 plan audit iterations** — if the plan still has issues after 3 audits, proceed with a note
- **Max 2 quality gate iterations per phase** — don't loop endlessly on minor issues
- **Max 2 final audit iterations** — fix the big stuff, note the rest
- **Never skip tests** — Phase 4b is mandatory, no shortcuts
- **Don't fix SUGGESTION-level issues** until all BUG and RISK issues are resolved
- **Don't change API contracts** without user approval
- **Don't add new dependencies** without user approval
- **Load skills on demand** — don't try to remember patterns from memory
- **Small, focused changes** — each task should do one thing
- **Follow existing patterns** — consistency with the codebase trumps "better" approaches
- **Ask when blocked** — if a design decision is needed, ask the user rather than guessing
