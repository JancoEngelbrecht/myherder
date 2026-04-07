/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/server/tests/**/*.test.js', '**/server/tests/**/*.test.ts'],
  // Runs before each test file's module environment is set up — use this to set env vars
  // before any require() calls so knex/jwt config picks them up correctly.
  setupFiles: ['./server/tests/jest.setup.js'],
  // Each test file runs in its own worker (Jest default), giving each its own in-memory
  // SQLite DB and clean module cache.
  coveragePathIgnorePatterns: ['/node_modules/', '/client/'],
  collectCoverageFrom: ['server/**/*.js', 'server/**/*.ts', '!server/index.js', '!server/seeds/**'],
  transform: {
    '^.+\\.tsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
          target: 'es2022',
        },
      },
    ],
  },
}
