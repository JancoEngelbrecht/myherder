require('dotenv').config({ quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv,
  isProduction,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  dbPath: process.env.DB_PATH || './dev.sqlite3',

  // Auth configuration
  jwtExpiryPassword: process.env.JWT_EXPIRY_PASSWORD || '24h',
  jwtExpiryPin: process.env.JWT_EXPIRY_PIN || '7d',
  loginRateLimitWindow: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW, 10) || 15 * 60 * 1000,
  loginRateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10,
  lockoutDuration: parseInt(process.env.LOCKOUT_DURATION, 10) || 15 * 60 * 1000,
  lockoutThreshold: parseInt(process.env.LOCKOUT_THRESHOLD, 10) || 5,

  // CORS
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : null,
};
