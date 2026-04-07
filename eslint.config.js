// eslint.config.js
const js = require('@eslint/js')
const pluginN = require('eslint-plugin-n')
const pluginSecurity = require('eslint-plugin-security')
const pluginVue = require('eslint-plugin-vue')
const vueParser = require('vue-eslint-parser')
const tsParser = require('@typescript-eslint/parser')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const configPrettier = require('eslint-config-prettier')
const globals = require('globals')

module.exports = [
  // 1. Global ignores
  {
    ignores: [
      'node_modules/**',
      'client/node_modules/**',
      'client/dist/**',
      'coverage/**',
      '**/*.min.js',
      '**/*.d.ts',
    ],
  },

  // 2. Server + root CJS files
  {
    files: ['server/**/*.js', 'knexfile.js', 'jest.config.js'],
    plugins: { n: pluginN, security: pluginSecurity },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    settings: {
      // Allow require() to resolve .ts files (TypeScript migration — .js files require .ts modules)
      n: { tryExtensions: ['.js', '.ts', '.json', '.node'] },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...pluginN.configs['flat/recommended-script'].rules,
      ...pluginSecurity.configs.recommended.rules,
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'no-console': 'off',
      semi: ['error', 'never'],
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'n/no-unpublished-require': 'off',
    },
  },

  // 2c. Server TypeScript files
  {
    files: ['server/**/*.ts'],
    plugins: { n: pluginN, security: pluginSecurity, '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    settings: {
      n: { tryExtensions: ['.js', '.ts', '.json', '.node'] },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...pluginSecurity.configs.recommended.rules,
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'no-console': 'off',
      semi: ['error', 'never'],
      'prefer-const': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // module.exports is valid in TS files transpiled to CJS
      'n/no-unsupported-features/es-syntax': 'off',
    },
  },

  // 3b. Client TypeScript files (ESM)
  {
    files: ['client/src/**/*.ts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      semi: ['error', 'never'],
      'prefer-const': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // 3. Client JS files (ESM)
  {
    files: ['client/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      semi: ['error', 'never'],
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // 4. Vue SFCs
  {
    files: ['client/src/**/*.vue'],
    plugins: { vue: pluginVue },
    languageOptions: {
      parser: vueParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: { ...globals.browser, ...globals.es2022 },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...pluginVue.configs['vue3-recommended'].rules,
      'no-undef': 'off', // script setup macros (defineProps etc.) not in scope
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      semi: ['error', 'never'],
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
    },
  },

  // 5. Test files — relax rules
  {
    files: [
      'server/tests/**/*.js',
      'server/tests/**/*.ts',
      'client/src/**/*.test.js',
      'client/src/**/*.test.ts',
      'client/src/**/*.spec.js',
      'client/src/**/*.spec.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },

  // 6. Prettier — always last
  configPrettier,
]
