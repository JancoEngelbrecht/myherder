#!/bin/bash
# ============================================
#  UserPromptSubmit Hook: Suggest Skills
#  Detects keywords in user prompts and
#  reminds Claude to load relevant skills.
# ============================================

INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.user_prompt // empty' | tr '[:upper:]' '[:lower:]')

# Exit early if no prompt
if [ -z "$PROMPT" ]; then
  exit 0
fi

SUGGESTIONS=""

# Express / API patterns
if echo "$PROMPT" | grep -qE '\b(route|endpoint|api|middleware|express|joi|validation|request|response)\b'; then
  SUGGESTIONS="${SUGGESTIONS}  - express-patterns (API routes, Joi validation, middleware)\n"
fi

# Vue patterns
if echo "$PROMPT" | grep -qE '\b(component|vue|pinia|composable|template|v-model|v-for|emit|prop|slot|router)\b'; then
  SUGGESTIONS="${SUGGESTIONS}  - vue-patterns (Vue 3 Composition API, Pinia, vue-router)\n"
fi

# Testing
if echo "$PROMPT" | grep -qE '\b(test|spec|vitest|jest|mock|stub|assert|coverage|describe|it\()\b'; then
  SUGGESTIONS="${SUGGESTIONS}  - testing (test structure, mocking, coverage patterns)\n"
fi

# Database / Knex
if echo "$PROMPT" | grep -qE '\b(database|migration|query|knex|sqlite|postgres|schema|table|column|seed)\b'; then
  SUGGESTIONS="${SUGGESTIONS}  - knex-patterns (queries, migrations, schema changes)\n"
fi

# Refactoring
if echo "$PROMPT" | grep -qE '\b(refactor|extract|rename|simplify|restructure|cleanup|clean up)\b'; then
  SUGGESTIONS="${SUGGESTIONS}  - refactoring (safe refactoring patterns)\n"
fi

# Debugging
if echo "$PROMPT" | grep -qE '\b(bug|debug|broken|error|crash|fail|not working|issue|fix)\b'; then
  SUGGESTIONS="${SUGGESTIONS}  - debugging (systematic bug investigation)\n"
fi

# Frontend Design
if echo "$PROMPT" | grep -qE '\b(design|css|style|layout|color|font|typography|spacing|animation|ui|ux|accessibility|a11y|contrast|responsive|mobile-first|dark mode)\b'; then
  SUGGESTIONS="${SUGGESTIONS}  - frontend-design (typography, color, spacing, motion, accessibility)\n"
fi

# Linting / ESLint
if echo "$PROMPT" | grep -qE '\b(lint|eslint|neostandard|prettier|format)\b'; then
  SUGGESTIONS="${SUGGESTIONS}  - linting-neostandard-eslint9 (ESLint 9 flat config)\n"
fi

# Output suggestion if any matches found
if [ -n "$SUGGESTIONS" ]; then
  echo -e "SKILL REMINDER: Consider loading these skills before starting:\n${SUGGESTIONS}Load with: Read the skill file, e.g. skills/express-patterns/SKILL.md"
fi

exit 0
