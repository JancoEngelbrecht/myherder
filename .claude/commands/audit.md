---
description: Audit anything — a plan, implementation, architecture, security, UI design, or specific files. Read-only report with findings and verdict.
---

Audit the target the user specifies. Determine the **audit type** from context:

## Audit Types

### PLAN AUDIT
**Trigger:** User says "audit this plan", references a todo list, or asks to review a proposed approach.

Launch **2 parallel agents** using the @auditor persona:

**Agent 1 — Feasibility & Completeness:**
- Are all tasks atomic and verifiable?
- Are there missing steps or implicit assumptions?
- Are dependencies between tasks identified and ordered correctly?
- Are edge cases and error scenarios accounted for?
- Is the scope realistic or is it trying to do too much in one pass?
- Are breaking changes flagged?

**Agent 2 — Risk & Architecture:**
- Does the plan follow existing patterns in the codebase? (Read CLAUDE.md first)
- Are there architectural risks (tight coupling, wrong abstraction level, performance cliffs)?
- Are there security implications not addressed?
- Could any step cause data loss or corruption?
- Are rollback strategies needed for any step?

### IMPLEMENTATION AUDIT
**Trigger:** User says "audit this implementation", "audit these changes", or references recently written code.

Launch **3 parallel agents** using the @auditor persona:

**Agent 1 — Correctness & Safety:**
- SAFETY checklist from @auditor (SQL injection, auth gaps, XSS, input validation, ownership checks)
- Does the code actually do what it's supposed to? Trace the happy path end-to-end.
- Are error paths handled? What happens when things fail?

**Agent 2 — Quality & Efficiency:**
- QUALITY checklist from @auditor (naming, duplication, error patterns, convention adherence)
- EFFICIENCY checklist from @auditor (N+1 queries, missing pagination, unnecessary re-renders)
- Does the code follow the project's existing patterns?

**Agent 3 — Completeness & Integration:**
- Are there missing tests for new/changed logic?
- Are i18n keys added for both languages?
- Are Joi schemas updated for new/changed endpoints?
- Does it integrate correctly with existing code (imports, exports, route registration)?
- Are there dead code leftovers (old code not cleaned up, unused imports)?
- Does offline/sync still work if applicable?

### ARCHITECTURE AUDIT
**Trigger:** User says "audit this architecture", "audit this design", or asks about structural decisions.

Launch **2 parallel agents** using the @auditor persona:

**Agent 1 — Design Quality:**
- Is the separation of concerns clean?
- Are abstractions at the right level (not over/under-engineered)?
- Are there circular dependencies or tight coupling?
- Does it follow established patterns in the codebase? (Read CLAUDE.md first)
- Is the data model correct and normalized appropriately?

**Agent 2 — Scalability & Maintainability:**
- Will this design hold up as the feature grows?
- Are there performance bottlenecks baked into the architecture?
- Is it testable?
- Can parts be changed independently without ripple effects?
- Are there simpler alternatives that achieve the same goal?

### SECURITY AUDIT
**Trigger:** User says "audit security", "security review", "check for vulnerabilities", or asks about threats.

Launch the **@security** agent for a deep security analysis:

- Map the full attack surface (routes, WebSocket handlers, file uploads, URL params)
- Trace data flow from user input to storage/output
- Check auth boundaries on every state-changing operation
- Review dependencies for known vulnerabilities (`npm audit`)
- Test implicit trust assumptions ("the frontend validates this")
- Rate findings by exploitability and impact

This is deeper than the SAFETY category in a regular audit — it includes threat modeling, attack chain tracing, and business logic security.

### DESIGN AUDIT
**Trigger:** User says "audit the design", "audit the UI", "audit CSS", or references visual/design quality.

Launch **2 parallel agents** using the @auditor persona (load the `frontend-design` skill first):

**Agent 1 — Visual Quality & Anti-Patterns:**
- Run the AI Slop Test — does this look like generic AI output?
- Typography: Is there a clear type scale? Appropriate font choice? Minimum sizes met?
- Color: OKLCH usage? Tinted neutrals? Palette cohesion? Dark mode done correctly?
- Spatial: Consistent spacing scale? Unnecessary card nesting? Touch targets adequate?
- Motion: Appropriate timing/easing? `prefers-reduced-motion` respected?

**Agent 2 — Accessibility & Interaction:**
- WCAG AA contrast ratios met for all text and UI components?
- All interactive elements have 8 states (default, hover, focus, active, disabled, loading, error, success)?
- Focus styles present and visible (`:focus-visible`, 3:1 contrast, 2-3px)?
- Semantic HTML used (`<dialog>`, `<label>`, `<fieldset>`, skip links)?
- Forms: visible labels, blur validation, specific error messages?
- Responsive: mobile-first? Container queries? Real device considerations?
- UX writing: specific button labels? Actionable error messages? Consistent terminology?

### FILE AUDIT
**Trigger:** User points to specific files or a directory.

Launch **2 parallel agents** using the @auditor persona:

**Agent 1:** Run SAFETY + EFFICIENCY + DEADCODE checklists on the specified files.
**Agent 2:** Run QUALITY + READABILITY + EFFECTIVENESS checklists on the specified files.

## Process

1. **Determine audit type** from user's message. If ambiguous, ask.
2. **Determine scope** — what specifically to audit. If the user said "audit this", look at:
   - Active todo list (plan audit)
   - Recent `git diff` or `git diff --staged` (implementation audit)
   - The file/directory they're viewing or mentioned (file audit)
3. **Launch parallel agents** as defined above.
4. **Compile results** into a single report.

## Output Format

```
# Audit Report — [Type] Audit

## Scope
[What was audited — files, plan, etc.]

## Findings

### Critical (must fix before proceeding)
- **[location]** — Description. Impact: [what breaks]. Suggestion: [how to fix].

### Important (should fix)
- **[location]** — Description. Impact: [what degrades]. Suggestion: [how to fix].

### Minor (nice to have)
- **[location]** — Description. Suggestion: [improvement].

## Verdict
[PASS / PASS WITH CONDITIONS / NEEDS WORK]

[1-2 sentence summary of overall state and recommended next action]
```

If there are no Critical or Important findings, the verdict is **PASS**.
If there are Important but no Critical findings, the verdict is **PASS WITH CONDITIONS**.
If there are any Critical findings, the verdict is **NEEDS WORK**.

## Handoff

If the verdict is **PASS WITH CONDITIONS** or **NEEDS WORK**, ask the user:

> "Would you like me to run `/fix` to address the Critical and Important findings?"

If the user agrees, proceed with `/fix` — the findings from this audit carry over automatically (no need to re-audit).

## Rules

- **Never edit or write files** — this is a read-only audit
- **Be concrete** — every finding must reference a specific location and have a clear impact statement
- **Don't invent issues** — if it's solid, say so
- **Read CLAUDE.md and MEMORY.md first** — don't re-report known issues
- **Prioritize ruthlessly** — Critical findings are things that are broken or dangerous NOW, not hypothetical
- **Keep it actionable** — every finding should have a clear "what to do about it"
