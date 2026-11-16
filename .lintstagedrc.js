// lint-staged configuration
// Note: tsc and vue-tsc don't accept individual file paths — they use tsconfig.json.
// The function pattern (() => command) ignores the staged file list and runs the full type check.
// This is the correct lint-staged pattern for TypeScript projects.
module.exports = {
  // Backend TypeScript: run full tsc project check whenever a .ts file is staged
  'server/**/*.ts': () => 'npm run typecheck',

  // Frontend TypeScript/Vue: full vue-tsc project check whenever a client file is staged
  'client/src/**/*.{ts,vue}': () => 'npm --prefix client run typecheck',

  // Format and lint all staged JS/TS/Vue files
  '*.{js,ts,vue}': ['prettier --write', 'eslint --fix'],

  // Format-only for other file types
  '*.{css,json,md}': ['prettier --write'],
}
