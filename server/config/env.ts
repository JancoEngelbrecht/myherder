import 'dotenv/config'

const nodeEnv: string = process.env.NODE_ENV || 'development'
const isProduction: boolean = nodeEnv === 'production'
const isTest: boolean = nodeEnv === 'test'
const isDevelopment: boolean = !isProduction && !isTest

const JWT_SECRET_MIN_LENGTH = 32
const DEFAULT_JWT_SECRET = 'dev-secret-change-in-production-32chars'

// ── JWT Secret Validation ────────────────────────────────────────
//
// - test: allow default (predictable secret required for token generation in tests)
// - development: warn loudly but allow fallback
// - production/staging: require a strong secret or refuse to start

let jwtSecret: string

if (isTest) {
  // Tests need a stable, predictable secret
  jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT_SECRET
} else if (isProduction) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET is required in production and must be at least ${JWT_SECRET_MIN_LENGTH} characters. ` +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    )
  }
  jwtSecret = process.env.JWT_SECRET
} else {
  // development (or any other env)
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < JWT_SECRET_MIN_LENGTH) {
    process.stderr.write(
      '\n[WARNING] JWT_SECRET is not set or is less than 32 characters. ' +
        'Using insecure default. Set JWT_SECRET in your .env file before deploying.\n\n'
    )
    jwtSecret = DEFAULT_JWT_SECRET
  } else {
    jwtSecret = process.env.JWT_SECRET
  }
}

// ── Database Validation (production) ─────────────────────────────
//
// MySQL connection vars are required in production — fail fast so the
// operator sees a clear message instead of a cryptic ECONNREFUSED later.

if (isProduction) {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(
      `Missing required database environment variables for production: ${missing.join(', ')}. ` +
        'Set these in your .env or cPanel environment configuration.'
    )
  }
}

// ── CORS Origins ─────────────────────────────────────────────────
//
// - development: default to localhost dev origins
// - production: require explicit ALLOWED_ORIGINS or refuse to start

let corsOrigins: string[]

if (isProduction) {
  if (!process.env.ALLOWED_ORIGINS) {
    throw new Error(
      'ALLOWED_ORIGINS environment variable is required in production. ' +
        'Set it to a comma-separated list of allowed origins, e.g. ALLOWED_ORIGINS=https://yourdomain.com'
    )
  }
  corsOrigins = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
} else if (process.env.ALLOWED_ORIGINS) {
  corsOrigins = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
} else {
  // Default to safe localhost origins for dev and test
  corsOrigins = ['http://localhost:5173', 'http://localhost:3000']
}

export interface EnvConfig {
  port: number
  nodeEnv: string
  isProduction: boolean
  isDevelopment: boolean
  isTest: boolean
  jwtSecret: string
  dbPath: string
  jwtExpiryPassword: string
  jwtExpiryPin: string
  loginRateLimitWindow: number
  loginRateLimitMax: number
  lockoutDuration: number
  lockoutThreshold: number
  corsOrigins: string[]
  /** @deprecated use corsOrigins */
  allowedOrigins: string[]
}

const envConfig: EnvConfig = {
  port: parseInt(process.env.PORT ?? '', 10) || 3000,
  nodeEnv,
  isProduction,
  isDevelopment,
  isTest,
  jwtSecret,
  dbPath: process.env.DB_PATH || './dev.sqlite3',

  // Auth configuration
  jwtExpiryPassword: process.env.JWT_EXPIRY_PASSWORD || '24h',
  jwtExpiryPin: process.env.JWT_EXPIRY_PIN || '7d',
  loginRateLimitWindow: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW ?? '', 10) || 15 * 60 * 1000,
  loginRateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX ?? '', 10) || 10,
  lockoutDuration: parseInt(process.env.LOCKOUT_DURATION ?? '', 10) || 15 * 60 * 1000,
  lockoutThreshold: parseInt(process.env.LOCKOUT_THRESHOLD ?? '', 10) || 5,

  // CORS — always a non-null array
  corsOrigins,

  // Legacy alias (kept for any existing code that imports allowedOrigins)
  allowedOrigins: corsOrigins,
}

module.exports = envConfig
