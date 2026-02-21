---
description: Review recent code changes for bugs, security issues, and missing test coverage.
---

Use the @reviewer agent to review the most recent changes.

Steps:
1. Run `git diff` to see what changed (or `git diff --staged` for staged changes)
2. Read each changed file in full context
3. Trace happy path and error paths
4. Check edge cases and boundary conditions
5. Verify test coverage for critical logic
6. Deliver findings with severity levels and specific fix suggestions
