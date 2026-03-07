---
name: prettier-config
description: Load when configuring Prettier, resolving formatting conflicts with ESLint, or setting up consistent code formatting. Sources — Prettier official docs (prettier.io/docs).
---

# Prettier Configuration

Official documentation: https://prettier.io/docs/en/

---

## 1. Config File

Create `.prettierrc` in project root. Prettier auto-detects this file.

Supported formats: `.prettierrc` (JSON/YAML), `.prettierrc.json`, `.prettierrc.js`, `.prettierrc.cjs`, `prettier.config.js`.

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "endOfLine": "lf"
}
```

---

## 2. Key Options

| Option | Default | Recommended | Notes |
|--------|---------|-------------|-------|
| `printWidth` | 80 | 100 | Target, not hard limit |
| `tabWidth` | 2 | 2 | Spaces per indent |
| `useTabs` | false | false | Spaces vs tabs |
| `semi` | true | false | Match neostandard (no semis) |
| `singleQuote` | false | true | Match neostandard |
| `trailingComma` | "all" | "all" | Cleaner diffs |
| `bracketSpacing` | true | true | `{ foo }` not `{foo}` |
| `arrowParens` | "always" | "always" | `(x) => x` not `x => x` |
| `endOfLine` | "lf" | "lf" | Prevent cross-platform issues |
| `proseWrap` | "preserve" | "preserve" | Don't rewrap markdown |

### Aligning with neostandard

If using neostandard (no semicolons, single quotes), set `semi: false` and `singleQuote: true` to avoid conflicts.

---

## 3. Ignore File

Create `.prettierignore` in project root:

```
dist/
node_modules/
coverage/
*.min.js
*.min.css
```

Prettier also respects `.gitignore` by default.

---

## 4. ESLint Integration

Prettier handles formatting. ESLint handles code quality. Don't overlap.

### Recommended approach

Use `eslint-config-prettier` to disable ESLint formatting rules that conflict:

```js
// eslint.config.js (flat config)
import prettierConfig from 'eslint-config-prettier'

export default [
  // ... your other configs
  prettierConfig  // must be LAST to override formatting rules
]
```

Do NOT use `eslint-plugin-prettier` (runs Prettier inside ESLint) — it's slower and produces noisy output.

---

## 5. Scripts

```json
{
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

- `--write` — formats files in place
- `--check` — exits with error if files aren't formatted (CI use)

---

## 6. Editor Integration

### VS Code

Install the Prettier extension. Add to `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "[javascript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[vue]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
}
```

---

## 7. Pre-commit Hook

Use with `lint-staged` to format only staged files:

```json
{
  "lint-staged": {
    "*.{js,vue,json,css,md}": "prettier --write"
  }
}
```

---

## 8. Gradual Adoption

For large codebases, use the pragma approach:

```json
{
  "requirePragma": true
}
```

Only files with `// @format` or `/** @prettier */` at the top get formatted. Remove `requirePragma` once the full codebase is formatted.

To exclude specific files inline:

```js
// prettier-ignore
const matrix = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1
]
```

---

## 9. EditorConfig Compatibility

Prettier reads `.editorconfig` and maps:
- `indent_style` → `useTabs`
- `indent_size` / `tab_width` → `tabWidth`
- `max_line_length` → `printWidth`
- `end_of_line` → `endOfLine`

`.prettierrc` values take precedence over `.editorconfig`.

---

## 10. Common Pitfalls

- `printWidth` is a target, not a hard limit — Prettier may produce longer lines
- Run Prettier BEFORE ESLint in CI: `prettier --check . && eslint .`
- `eslint-config-prettier` must be the LAST config in your ESLint array
- Don't configure formatting rules in ESLint if Prettier handles them
- Set `.gitattributes` with `* text=auto eol=lf` to prevent line ending issues
