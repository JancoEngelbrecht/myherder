// Runs before any module is imported in each test worker.
// Setting env vars here ensures knex, jwt, and rate-limiter all pick up the test values.
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod'
// Effectively disable rate limiting so auth tests can make many requests freely
process.env.LOGIN_RATE_LIMIT_MAX = '10000'
process.env.LOGIN_RATE_LIMIT_WINDOW = '1'
// Suppress dotenv's tip logs and the errorHandler's console.error for intentional
// error-path tests (e.g. duplicate key → 409, not-found → 404).
process.env.DOTENV_QUIET = 'true'

console.error = () => {}
