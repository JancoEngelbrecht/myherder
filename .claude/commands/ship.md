---
description: Pre-ship checklist — run tests, self-review, code review, commit if everything passes.
---

Complete pre-ship checklist in order:

1. **Test** — Run the project's test suite. If tests fail, stop and report.
2. **Self-review** — Load the `code-standards` skill. Check all changed files for: dead code, error handling gaps, type safety violations, readability issues. Fix any issues found.
3. **Review** — Use the @auditor agent in **diff mode** to review all changes since last commit.
4. **Evaluate** — If review has BUG-level findings, stop and report them. RISK and SUGGESTION findings can be noted but don't block.
5. **Reality check** — Before committing, be deliberately skeptical. Default assumption: **this is NOT ready to ship.** Override only with evidence:
   - Trace the full user flow end-to-end — does it actually work, or does it just look right?
   - What's the most likely failure a user will hit that tests don't cover?
   - Are there any implicit assumptions (e.g., "the frontend validates this", "this field is always present")?
   - Does this change any API contract, database schema, or sync behavior? If yes, flag as breaking change.
   - If anything feels uncertain, investigate before shipping — don't hope for the best.
6. **Commit** — If tests pass, review is clean, and reality check holds, create a commit with a conventional commit message (feat:, fix:, refactor:, etc.)
7. **Report** — Summarize what was shipped.

If any step fails, stop and explain what needs to be fixed before shipping.
