---
name: audit-plan
description: Audit an implementation plan against the actual codebase. Verify every claim, fix every gap, update the plan file in place. Use when the user says "audit this plan", "verify this plan", or "make this plan watertight".
---

# Plan Audit

Systematically verify an implementation plan against the actual codebase, fix inaccuracies, and fill gaps — then update the plan file in place.

## Trigger

User says any of: "audit this plan", "verify this plan", "make this watertight", "check this plan against the codebase", or similar.

## Inputs

- **Plan file** — the `.md` file to audit (from IDE selection, user message, or most recently opened file)
- **Codebase** — the actual source of truth

## Process

### Phase 1: Extract Claims

Read the plan and identify every verifiable claim. Claims vary by domain:

**Backend / Database plans:**
- Schema details (columns, types, nullability, defaults, constraints)
- Index names and columns
- FK relationships and CASCADE rules
- Migration ordering and dependencies
- API contracts (routes, params, response shapes)

**Frontend plans:**
- Component hierarchy and import paths
- Store/state shape and action names
- Route definitions and guards
- i18n key references
- CSS class and design token references

**Infrastructure / Config plans:**
- Environment variables and defaults
- Package dependencies and versions
- Build/deploy scripts and commands
- File paths and directory structure

**Cross-cutting:**
- Referenced files, functions, or patterns ("follow pattern from X")
- Dependency ordering between tasks
- Scope boundaries (what's in vs out)
- Platform/environment branches (dev vs prod, SQLite vs MySQL, etc.)

### Phase 2: Verify Against Codebase

For each claim, verify against the actual source of truth:

1. **Read the actual code** — don't trust the plan's description of current state. Use Glob, Grep, Read, and Bash to check.
2. **Compare** — diff every detail: names, types, order, existence.
3. **Trace dependencies** — verify ordering won't break anything. Check what references what.
4. **Check completeness** — look for things the plan SHOULD mention but doesn't. Missing edge cases, missing platforms, missing rollback steps.

### Phase 3: Classify Findings

| Severity | Criteria | Action |
|----------|----------|--------|
| **BUG** | Will cause runtime failure, build failure, data loss, or crash | Fix immediately |
| **GAP** | Missing coverage — a scenario, platform, or edge case not addressed | Add to plan |
| **INCONSISTENCY** | Plan contradicts itself or uses wrong names/paths/values | Fix in plan |
| **STYLE** | Correct but inconsistent with codebase conventions | Fix in plan |
| **NOTE** | Observation worth documenting but doesn't need a code fix | Add as comment |

### Phase 4: Fix In Place

Update the plan file directly using Edit tool. Do NOT create a separate findings document — fix the plan itself so it becomes the single source of truth.

- Fix all BUGs — wrong values, missing steps, broken references
- Fill all GAPs — missing branches, missing rollback, missing edge cases
- Resolve INCONSISTENCYs — pick the correct version, update all references
- Fix STYLE issues — match codebase conventions (naming, formatting, patterns)

### Phase 5: Report

Output a summary table of all changes:

```
| # | Severity | What was wrong | What was fixed |
|---|----------|----------------|----------------|
```

## Verification Checklist

Before marking complete, confirm:

- [ ] Every reference to existing code (files, functions, routes, components) has been verified to exist
- [ ] Every claim about current state matches the actual codebase
- [ ] No silent side-effects — plan accounts for everything it touches
- [ ] Platform/environment branches are complete (if applicable)
- [ ] Rollback/undo strategy handles all changes (if applicable)
- [ ] Code snippets are syntactically correct and use the right APIs
- [ ] Dependency ordering between steps is valid
- [ ] Risk mitigations are actionable, not just "be careful"

## Anti-patterns to Flag

- **Phantom references** — Plan references a file, function, index, or config that doesn't exist
- **Stale patterns** — "Follow pattern from X" but X has since changed or uses a different approach
- **Missing platform branch** — Solution for one environment without equivalent for another
- **Incomplete undo** — Rollback/down/revert doesn't reverse all forward changes
- **Contradictory claims** — Plan says X in one section and not-X in another
- **Assumed state** — Plan assumes something exists or is true without verifying
- **Redundant declarations** — Same thing defined twice in different ways (duplicate constraints, re-exports, etc.)
- **Convention mismatch** — Plan uses different naming, structure, or patterns than the existing codebase
