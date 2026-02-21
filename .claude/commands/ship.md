---
description: Pre-ship checklist — run tests, self-review, code review, commit if everything passes.
---

Complete pre-ship checklist in order:

1. **Test** — Run the project's test suite. If tests fail, stop and report.
2. **Self-review** — Load the `code-standards` skill. Check all changed files for: dead code, error handling gaps, type safety violations, readability issues. Fix any issues found.
3. **Review** — Use the @reviewer agent to review all changes since last commit.
4. **Evaluate** — If review has BUG-level findings, stop and report them. RISK and SUGGESTION findings can be noted but don't block.
5. **Commit** — If tests pass and review is clean, create a commit with a conventional commit message (feat:, fix:, refactor:, etc.)
6. **Report** — Summarize what was shipped.

If any step fails, stop and explain what needs to be fixed before shipping.
