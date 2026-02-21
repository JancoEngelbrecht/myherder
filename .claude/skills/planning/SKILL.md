---
name: planning
description: Load when breaking down features into implementation plans. Provides task decomposition methodology with atomic, verifiable steps.
---

# Planning & Task Decomposition

## Process

1. **Read** — Understand the current codebase state (structure, patterns, relevant files)
2. **Scope** — Clarify what's in and out of scope for this task
3. **Decompose** — Break into atomic tasks (each independently testable and verifiable)
4. **Order** — Sequence by dependencies (what must exist before the next step)
5. **Risk** — Flag unknowns, external dependencies, or things that need a design decision first

## Task Format

For each task:

```
- [ ] **Task N: [Name]** — [What to do]
  - Complexity: S / M / L
  - Files: [files to create/modify]
  - Depends on: [nothing / Task N]
  - Verify: [how to confirm this is done correctly]
```

## Decomposition Rules

- Every task must be independently verifiable — "it works" is not verification
- "Refactor X" is not a task — "Extract Y into Z, update imports, add tests for Z" is
- Flag anything that needs a design decision BEFORE implementation starts
- If the task is too vague to plan, ask what needs clarifying
- Keep tasks small enough that each can be completed in one focused session
- Order tasks so each builds on the last — no circular dependencies

## Scope Template

Always start with:

```
### Scope
**In scope**: [what we're building]
**Out of scope**: [what we're explicitly NOT doing]
**Assumptions**: [what we're assuming is true]
```

## Risks Template

End with:

```
### Risks & Open Questions
- [Anything that needs a decision before starting]
- [External dependencies or unknowns]
- [Parts that might be harder than they look]
```
