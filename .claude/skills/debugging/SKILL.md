---
name: debugging
description: Load when stuck on a bug. Provides a systematic debugging methodology — reproduce, isolate, hypothesize, fix.
---

# Systematic Debugging

## The Process

Never skip steps. Never guess.

### Step 1: Reproduce

Before anything else, confirm the bug exists and is reproducible.

- Get the exact error message or unexpected behavior
- Find the minimal steps to trigger it
- Note the environment (OS, runtime version, dependencies)
- If you can't reproduce it, investigate why (environment-specific? timing-dependent? data-dependent?)

### Step 2: Isolate

Narrow down where the problem is.

- **Binary search**: Comment out half the code path. Does it still fail? Narrow further.
- **Check inputs**: Log/inspect the data at each step. Where does it first go wrong?
- **Check boundaries**: Is the bug at the edge of two modules? (Common for integration bugs)
- **Check recent changes**: `git log --oneline -20` and `git bisect` to find when it broke

### Step 3: Hypothesize

Form 2-3 specific theories. Write them down.

```
Theory 1: The user object is null because the auth middleware isn't running on this route
Theory 2: The user object exists but is missing the `email` field because the query doesn't join the profile table
Theory 3: The validation runs before the user is fetched due to middleware ordering
```

### Step 4: Test Each Theory

One at a time. Add targeted assertions or logging to confirm or eliminate.

```
// Testing Theory 1:
console.log("Auth middleware:", req.user);  // → { id: 123, name: "test" }
// Theory 1 eliminated — user exists

// Testing Theory 2:
console.log("User fields:", Object.keys(req.user));  // → ["id", "name"]
// Theory 2 confirmed — email field is missing
```

If a theory is wrong, **revert the debug changes** before testing the next one.

### Step 5: Fix

Make the **minimal** change that fixes the root cause.

- Fix the cause, not the symptom
- If the fix is more than ~10 lines, reconsider — you might be patching around the problem
- Add a test that would have caught this bug

### Step 6: Verify

- Run the failing case — does it pass now?
- Run the full test suite — did the fix break anything else?
- Check related code paths — could the same bug exist elsewhere?

### Step 7: Clean Up

- Remove all debug logging
- Make sure the fix is production-quality (error handling, types, etc.)
- Add a comment explaining *why* the fix is needed if it's non-obvious

## Tools

| Situation | Tool |
|-----------|------|
| Know roughly where | Add logging at key points |
| No idea where | `git bisect` to find the breaking commit |
| Timing/race condition | Add timestamps to logs, check async ordering |
| Data-dependent | Log the input that causes the failure, create a test fixture |
| Environment-specific | Compare configs, dependency versions, OS differences |

## When to Stop

After 3 failed fix attempts:
1. **Stop editing** — you're likely going in circles
2. **Document** what you've tried and what each attempt revealed
3. **Ask for help** — rubber duck, teammate, or step away and come back fresh

The goal is not to never be stuck. The goal is to be stuck *productively* — learning something from each attempt.

## Behavioral Rules

- NEVER make changes before reproducing the bug
- NEVER shotgun debug (random changes hoping something works)
- NEVER fix symptoms — find and fix root causes
- ONE change at a time, verify after each
- If a hypothesis is wrong, revert the debug changes before trying the next one
- Keep a running log of what you've tried and what each attempt revealed

## Common Traps

- **"It works on my machine"** — check environment differences (OS, runtime version, config)
- **Fixing the error message** instead of the underlying cause
- **Assuming the bug is where the error surfaces** — it's often upstream in the call chain
- **Not checking git blame** — the bug may have been introduced recently (`git log --oneline -20`)
- **Ignoring race conditions** — if behavior is intermittent, suspect async/timing issues
