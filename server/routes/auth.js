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

const loginLimiter = rateLimit({
  windowMs: loginRateLimitWindow,
  max: loginRateLimitMax,
  message: { error: 'Too many login attempts, try again later' }
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
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await db('users').where({ id: user.id }).update({
        failed_attempts: (user.failed_attempts || 0) + 1
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db('users').where({ id: user.id }).update({ failed_attempts: 0 });

    const userPayload = buildUserResponse(user);
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
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked' });
    }

    const valid = await bcrypt.compare(String(pin), user.pin_hash);
    if (!valid) {
      const attempts = (user.failed_attempts || 0) + 1;
      const update = { failed_attempts: attempts };
      if (attempts >= lockoutThreshold) {
        update.locked_until = new Date(Date.now() + lockoutDuration).toISOString();
      }
      await db('users').where({ id: user.id }).update(update);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db('users').where({ id: user.id }).update({ failed_attempts: 0, locked_until: null });

    const userPayload = buildUserResponse(user);
    const token = jwt.sign(userPayload, jwtSecret, { expiresIn: jwtExpiryPin });

    res.json({ token, user: userPayload });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh — refresh JWT using current valid token
router.post('/refresh', async (req, res, next) => {
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

    const userPayload = buildUserResponse(user);
    // Determine original expiry type from token claims
    const expiry = decoded.role === 'admin' ? jwtExpiryPassword : jwtExpiryPin;
    const token = jwt.sign(userPayload, jwtSecret, { expiresIn: expiry });

    res.json({ token, user: userPayload });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
