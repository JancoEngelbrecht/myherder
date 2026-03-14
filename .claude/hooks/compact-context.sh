#!/bin/bash
# ============================================
#  SessionStart Hook (compact matcher):
#  Re-inject Critical Context After Compaction
#  Ensures key rules survive context window
#  compression in long sessions.
# ============================================

cat <<'CONTEXT'
SESSION RESUMED AFTER COMPACTION — Critical rules reminder:

MANDATORY WORKFLOW:
1. Load relevant skills BEFORE coding (not optional)
2. Self-review after EVERY change (3-pass: correctness, cleanliness, security)
3. Tests must pass before any task is done

HARD RULES:
- Validate all inputs with Joi (abortEarly: false, stripUnknown: true)
- Use validated `value`, never raw req.body
- Parameterize ALL queries — never concatenate SQL
- UUIDs for all entity IDs — never Number(id)
- No dead code — delete unused imports, variables, exports immediately
- No empty catch blocks — handle errors with context
- Always use <style scoped> in Vue components
- Always await promises — no fire-and-forget

Check TodoWrite for current task progress. Re-read relevant files before continuing.
CONTEXT

exit 0
