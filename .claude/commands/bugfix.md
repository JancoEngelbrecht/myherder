---
description: Fix a bug from a screenshot, error message, or description. Loads debugging skill, follows systematic reproduce → isolate → fix → verify methodology.
---

Fix the bug the user describes. They may provide a screenshot, error message, stack trace, or plain description.

## Step 1: UNDERSTAND

1. Read CLAUDE.md to understand the project stack and structure
2. Load the `debugging` skill
3. Gather what you know:
   - What's the symptom? (error message, wrong behavior, crash)
   - Where does it happen? (which page, route, action)
   - What's the expected behavior?
4. If the user provided a screenshot, analyze it for: error messages, URL/route, component state, console errors, network failures

## Step 2: REPRODUCE

1. Find the relevant code path (route, component, service)
2. Read the code and trace the flow that leads to the bug
3. Identify the specific line(s) where the bug occurs
4. If you can't find the bug from the description alone, check:
   - Recent git changes (`git log --oneline -10`, `git diff`)
   - Related test files for clues about expected behavior
   - Error handling paths that might be swallowing the real error

## Step 3: ISOLATE

1. Identify the root cause (not just the symptom)
2. Check if this bug affects other places (search for similar patterns)
3. Determine the minimal fix — don't refactor, just fix the bug

## Step 4: FIX

1. Load relevant skills for the fix (express-patterns, vue-patterns, etc.)
2. Make the minimal change to fix the root cause
3. Self-review: does this fix actually solve the problem without breaking anything else?

## Step 5: VERIFY

1. Run the test suite — all tests must pass
2. Run lint
3. If there's an existing test for this behavior, make sure it passes
4. If there's NO test for this behavior, write one that reproduces the bug and confirms the fix
5. Check: could this bug exist in similar code elsewhere? If yes, fix those too.

## Step 6: DONE

Report what was found and fixed:

```
# Bug Fix Report

## Bug
[What was wrong — 1-2 sentences]

## Root Cause
[Why it happened — the actual cause, not just the symptom]

## Fix
[What was changed and why]

## Files Changed
- [file] — [what changed]

## Tests
- [pass/fail count]
- [new test added? which file?]
```

Then ask: "Ready to ship? I can run `/ship` to commit this."

## Rules

- **Reproduce before fixing** — understand the bug before changing code
- **Minimal changes** — fix the bug, don't refactor surrounding code
- **One root cause** — don't fix unrelated issues you notice (note them for later)
- **Always add a test** — if no test covers this bug, write one
- **Don't guess** — if you can't find the cause, say so and ask for more information
