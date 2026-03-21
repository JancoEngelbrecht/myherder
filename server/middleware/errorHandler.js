const { recordError } = require('../helpers/requestStats');

module.exports = function errorHandler(err, req, res, _next) {
  console.error(err.stack || err.message || err);

  // Database unique constraint violations (SQLite + MySQL)
  if (
    err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    err.code === 'ER_DUP_ENTRY' ||
    (err.message && err.message.includes('UNIQUE'))
  ) {
    return res.status(409).json({ error: 'A record with that value already exists' });
  }

  // Joi / validation errors forwarded with status
  const status = err.status || 500;
  const raw = status === 500
    ? (process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error'))
    : err.message;
  const message = typeof raw === 'string' ? raw.replace(/['"]/g, '') : raw;

  // Record 5xx errors for the system health dashboard (use err.message
  // directly — this data is super-admin-only and in-memory only)
  if (status >= 500) {
    const errorMsg = err.message || 'Internal server error'
    recordError(req.method, req.originalUrl || req.url, status, errorMsg);
  }

  const response = { error: message };
  if (status === 500 && err.code && process.env.NODE_ENV !== 'production') {
    response.code = err.code;
  }

  res.status(status).json(response);
};
