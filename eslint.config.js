// eslint.config.js
const js = require('@eslint/js')
const pluginN = require('eslint-plugin-n')
const pluginVue = require('eslint-plugin-vue')
const vueParser = require('vue-eslint-parser')
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
    ],
  },

  // 2. Server + root CJS files
  {
    files: ['server/**/*.js', 'knexfile.js', 'jest.config.js'],
    plugins: { n: pluginN },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...pluginN.configs['flat/recommended-script'].rules,
      'no-console': 'off',
      semi: ['error', 'never'],
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'n/no-unpublished-require': 'off',
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
      'client/src/**/*.test.js',
      'client/src/**/*.spec.js',
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
      },
    },
    rules: { 'no-console': 'off' },
  },

  // 6. Prettier — always last
  configPrettier,
]
