---
name: knip-config
description: Load when configuring Knip for dead code detection, handling false positives, or integrating Knip into CI. Sources — Knip official docs (knip.dev).
---

# Knip Dead Code Detection

Official documentation: https://knip.dev

---

## 1. Setup

```bash
npm init @knip/config   # generates initial config
```

Or manually install:

```bash
npm install -D knip typescript @types/node
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "knip": "knip"
  }
}
```

Requires Node.js 18.18.0+.

---

## 2. Configuration

Create `knip.json` (or `knip.jsonc` for comments) in project root:

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": ["src/index.ts", "src/main.js"],
  "project": ["src/**/*.{js,ts,vue}"],
  "ignore": [],
  "ignoreDependencies": []
}
```

### Entry files

Entry files are the starting points Knip traces from. Everything not reachable from entries is flagged as unused.

### Project files

The full set of source files Knip considers. Files outside this scope are ignored.

---

## 3. What Knip Detects

- **Unused files** — source files not imported by anything
- **Unused exports** — exported functions/classes/types/constants not imported elsewhere
- **Unused dependencies** — packages in `package.json` not imported anywhere
- **Unused devDependencies** — dev packages not referenced by config or scripts
- **Unlisted dependencies** — imports that don't appear in `package.json`
- **Unlisted binaries** — CLI tools used in scripts but not in dependencies

---

## 4. Plugin System

Knip auto-detects tools and frameworks via plugins. Key plugins for this stack:

- **vite** — reads `vite.config.js` entries
- **vitest** — detects test file patterns
- **vue** — handles `.vue` SFC imports
- **eslint** — reads ESLint config references

Enable/disable plugins explicitly:

```json
{
  "vitest": true,
  "vue": true,
  "webpack": false
}
```

Override plugin config when auto-detection fails:

```json
{
  "vitest": {
    "config": "vitest.config.js",
    "entry": ["**/*.test.{js,ts}", "**/*.spec.{js,ts}"]
  }
}
```

---

## 5. Handling False Positives

### DO NOT just add everything to `ignore`

Instead, understand WHY Knip reports it:

1. **Missing entry file** — add it to `entry` config
2. **Plugin not detecting config** — override the plugin's `config` path
3. **Dynamic imports** — Knip can't trace `require(variable)` — add the target to `entry`
4. **Framework magic** — Vue auto-imports, Pinia stores used in templates, etc.

### When you must ignore

```json
{
  "ignore": ["src/generated/**"],
  "ignoreDependencies": ["better-sqlite3"],
  "ignoreExportsUsedInFile": {
    "interface": true,
    "type": true
  }
}
```

### Targeted ignores per issue type

```json
{
  "ignoreIssues": {
    "src/generated/**": ["exports", "types"],
    "**/*.d.ts": ["exports"]
  }
}
```

---

## 6. Path Aliases

Knip auto-reads `compilerOptions.paths` from `tsconfig.json`. For manual config:

```json
{
  "paths": {
    "@/*": ["./src/*"],
    "@lib/*": ["./lib/*"]
  }
}
```

---

## 7. CI Integration

```json
{
  "scripts": {
    "knip": "knip",
    "knip:ci": "knip --max-show-issues 0"
  }
}
```

`--max-show-issues 0` — fails on any issue without verbose output.

In CI pipeline:

```yaml
- run: npm run knip:ci
```

### Strict CI with config hints as errors

```json
{
  "treatConfigHintsAsErrors": true
}
```

This exits with code 1 if Knip has suggestions for improving your config.

---

## 8. Gradual Adoption

For large existing codebases, start conservatively:

```bash
knip --max-show-issues 5   # see a few issues at a time
```

Fix issues incrementally. Don't bulk-ignore everything.

### Production mode

Run `knip --production` to only report issues relevant to production code (ignores test files, dev dependencies).

---

## 9. Common Pitfalls

- Don't use `ignore` as a first resort — fix the root cause (missing entry, plugin config)
- Knip follows static imports only — dynamic `require()` and `import()` with variables are invisible
- Vue template usage (`:is`, `v-bind`, Pinia store access) may not be detected
- Re-exports (`export { foo } from './bar'`) are traced correctly
- Run `knip --debug` to understand why something is flagged
- Monorepo workspaces need per-workspace config under `"workspaces"`
