const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../config/database');
const {
  jwtSecret,
  jwtExpiryPassword,
  jwtExpiryPin,
  loginRateLimitWindow,
  loginRateLimitMax,
  lockoutDuration,
  lockoutThreshold,
} = require('../config/env');

const router = express.Router();

const MAX_USERNAME_LENGTH = 100;
const MAX_PASSWORD_LENGTH = 128;
const MAX_PIN_LENGTH = 10;

// Pre-hashed dummy value for constant-time comparison when user not found
const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

const loginLimiter = rateLimit({
  windowMs: loginRateLimitWindow,
  max: loginRateLimitMax,
  message: { error: 'Too many login attempts, try again later' }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many refresh attempts, please try again later' },
});

function buildUserResponse(user) {
  let permissions = user.permissions;
  if (typeof permissions === 'string') {
    try { permissions = JSON.parse(permissions); } catch { permissions = []; }
  }
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    permissions,
    language: user.language
  };
}

// ── Shared Lockout Helper ────────────────────────────────────────────────────

function isLockedOut(user) {
  return user.locked_until && new Date(user.locked_until) > new Date();
}

/**
 * Apply lockout logic after credential check.
 * Callers must check isLockedOut() before calling this.
 * Returns true if credentials were invalid (lockout counter incremented), false on success.
 */
async function checkAndApplyLockout(user, credentialValid) {
  if (!credentialValid) {
    const attempts = (user.failed_attempts || 0) + 1;
    const update = { failed_attempts: attempts };
    if (attempts >= lockoutThreshold) {
      update.locked_until = new Date(Date.now() + lockoutDuration).toISOString();
    }
    await db('users').where({ id: user.id }).update(update);
    return true;
  }

  // Successful login — clear lockout state
  await db('users').where({ id: user.id }).update({ failed_attempts: 0, locked_until: null });
  return false;
}

// POST /api/auth/login — password login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (username.length > MAX_USERNAME_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: 'Invalid input length' });
    }

    const user = await db('users').where({ username, is_active: true }).first();
    if (!user || !user.password_hash) {
      // Constant-time: run bcrypt even when user not found to prevent timing enumeration
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check lockout before expensive bcrypt compare
    if (isLockedOut(user)) {
      return res.status(423).json({ error: 'Account temporarily locked' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    await checkAndApplyLockout(user, valid);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userPayload = buildUserResponse(user);
    userPayload.login_type = 'password';
    const token = jwt.sign(userPayload, jwtSecret, { expiresIn: jwtExpiryPassword });

    res.json({ token, user: userPayload });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login-pin — PIN login
router.post('/login-pin', loginLimiter, async (req, res, next) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) {
      return res.status(400).json({ error: 'Username and PIN required' });
    }
    if (username.length > MAX_USERNAME_LENGTH || String(pin).length > MAX_PIN_LENGTH) {
      return res.status(400).json({ error: 'Invalid input length' });
    }

    const user = await db('users').where({ username, is_active: true }).first();
    if (!user || !user.pin_hash) {
      // Constant-time: run bcrypt even when user not found to prevent timing enumeration
      await bcrypt.compare(String(pin), DUMMY_HASH);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check lockout before expensive bcrypt compare
    if (isLockedOut(user)) {
      return res.status(423).json({ error: 'Account temporarily locked' });
    }

    const valid = await bcrypt.compare(String(pin), user.pin_hash);

    await checkAndApplyLockout(user, valid);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userPayload = buildUserResponse(user);
    userPayload.login_type = 'pin';
    const token = jwt.sign(userPayload, jwtSecret, { expiresIn: jwtExpiryPin });

    res.json({ token, user: userPayload });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh — refresh JWT using current valid token
router.post('/refresh', refreshLimiter, async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(header.slice(7), jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch fresh user data
    const user = await db('users').where({ id: decoded.id, is_active: true }).first();
    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    // Locked accounts cannot refresh tokens
    if (isLockedOut(user)) {
      return res.status(423).json({ error: 'Account temporarily locked' });
    }

    const userPayload = buildUserResponse(user);
    // Preserve original login type; fall back to role-based inference for legacy tokens
    userPayload.login_type = decoded.login_type || (decoded.role === 'admin' ? 'password' : 'pin');
    const expiry = (decoded.login_type === 'password' || (!decoded.login_type && decoded.role === 'admin'))
      ? jwtExpiryPassword : jwtExpiryPin;
    const token = jwt.sign(userPayload, jwtSecret, { expiresIn: expiry });

    res.json({ token, user: userPayload });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
