#!/bin/bash
# ============================================
#  Stop Hook: Post-Response Verification
#  After Claude finishes responding, check
#  if source files were modified and remind
#  about tests if they weren't run.
# ============================================

INPUT=$(cat)

# Check if any tools were used in this turn that modified files
# The stop hook receives the session context
# We check git status for uncommitted changes as a proxy
if ! command -v git &>/dev/null; then
  exit 0
fi

# Check if we're in a git repo
if ! git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  exit 0
fi

# Get modified source files (not test files, not config files)
MODIFIED=$(git diff --name-only 2>/dev/null | grep -E '\.(js|ts|jsx|tsx|vue)$' | grep -v '\.test\.' | grep -v '\.spec\.' | grep -v '__tests__' | head -5)

if [ -n "$MODIFIED" ]; then
  echo "NOTE: Source files have uncommitted changes. Remember to run tests before committing."
fi

exit 0
