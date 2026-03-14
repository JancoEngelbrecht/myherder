#!/bin/bash
# ============================================
#  PostToolUse Hook: Auto-Format After Edits
#  Runs Prettier on files after Edit/Write.
#  Silently skips if Prettier isn't available
#  or the file type isn't supported.
# ============================================

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Exit early if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only format supported file types
case "$FILE_PATH" in
  *.js|*.jsx|*.ts|*.tsx|*.vue|*.css|*.scss|*.html|*.json|*.md|*.yaml|*.yml)
    ;;
  *)
    exit 0
    ;;
esac

# Check if file exists (Write could have failed)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Try npx prettier first, fall back silently
if command -v npx &>/dev/null && [ -f "node_modules/.bin/prettier" ]; then
  npx prettier --write "$FILE_PATH" 2>/dev/null || true
fi

exit 0
