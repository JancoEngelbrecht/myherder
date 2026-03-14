#!/bin/bash
# ============================================
#  PreToolUse Hook: Protect Critical Files
#  Blocks Edit/Write to files that should
#  never be modified by AI agents.
# ============================================

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Exit early if no file path (shouldn't happen for Edit/Write)
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalize path separators for Windows compatibility
FILE_PATH=$(echo "$FILE_PATH" | sed 's|\\|/|g')
BASENAME=$(basename "$FILE_PATH")

# Protected exact filenames
PROTECTED_FILES=(
  ".env"
  ".env.local"
  ".env.production"
  ".env.staging"
  "package-lock.json"
  "pnpm-lock.yaml"
  "yarn.lock"
  "bun.lockb"
)

# Protected path patterns (substring match)
PROTECTED_PATTERNS=(
  ".git/"
  "node_modules/"
  "/dist/"
  "/build/"
)

# Check exact filenames
for protected in "${PROTECTED_FILES[@]}"; do
  if [ "$BASENAME" = "$protected" ]; then
    echo "BLOCKED: Cannot modify '$BASENAME' — this file should not be AI-edited. If you need changes here, ask the user to do it manually." >&2
    exit 2
  fi
done

# Check path patterns
for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "BLOCKED: Cannot modify files in '$pattern' — this path is protected." >&2
    exit 2
  fi
done

exit 0
