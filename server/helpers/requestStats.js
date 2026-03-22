// In-memory request stats — resets on process restart (ephemeral by design)
const WINDOW_SIZE = 1000
const ERROR_BUFFER_SIZE = 20

let stats = createFreshStats()

function createFreshStats() {
  return {
    startedAt: new Date().toISOString(),
    totalRequests: 0,
    errors4xx: 0,
    errors5xx: 0,
    // Circular buffer for O(1) insert
    responseTimes: new Array(WINDOW_SIZE),
    writeIndex: 0,
    count: 0, // how many slots are filled (max WINDOW_SIZE)
    // Recent 5xx errors (circular buffer, newest first on read)
    recentErrors: new Array(ERROR_BUFFER_SIZE),
    errorWriteIndex: 0,
    errorCount: 0,
  }
}

function recordRequest(durationMs, statusCode) {
  stats.totalRequests++
  if (statusCode >= 400 && statusCode < 500) stats.errors4xx++
  if (statusCode >= 500) stats.errors5xx++
  stats.responseTimes[stats.writeIndex] = durationMs
  stats.writeIndex = (stats.writeIndex + 1) % WINDOW_SIZE
  if (stats.count < WINDOW_SIZE) stats.count++
}

function getStats() {
  const filled = stats.responseTimes.slice(0, stats.count)
  let avgMs = 0
  let p95Ms = 0

  if (filled.length > 0) {
    const sum = filled.reduce((a, b) => a + b, 0)
    avgMs = Math.round(sum / filled.length)
    const sorted = [...filled].sort((a, b) => a - b)
    p95Ms = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1]
    p95Ms = Math.round(p95Ms)
  }

  const errorRate5xx =
    stats.totalRequests > 0 ? Number(((stats.errors5xx / stats.totalRequests) * 100).toFixed(2)) : 0

  return {
    started_at: stats.startedAt,
    total: stats.totalRequests,
    errors_4xx: stats.errors4xx,
    errors_5xx: stats.errors5xx,
    error_rate_5xx_pct: errorRate5xx,
    avg_response_ms: avgMs,
    p95_response_ms: p95Ms,
    window_size: filled.length,
  }
}

function recordError(method, path, status, message) {
  // Strip query string to avoid leaking tokens/secrets
  const cleanPath = (path || '/unknown').split('?')[0]
  // Coerce to string and truncate to avoid storing huge error strings
  const msgStr = String(message || 'Internal server error')
  const truncated = msgStr.length > 200 ? msgStr.slice(0, 200) + '…' : msgStr
  stats.recentErrors[stats.errorWriteIndex] = {
    timestamp: new Date().toISOString(),
    method,
    path: cleanPath,
    status,
    message: truncated,
  }
  stats.errorWriteIndex = (stats.errorWriteIndex + 1) % ERROR_BUFFER_SIZE
  if (stats.errorCount < ERROR_BUFFER_SIZE) stats.errorCount++
}

function getRecentErrors() {
  if (stats.errorCount === 0) return []
  const filled = []
  // Read from buffer in reverse insertion order (newest first)
  for (let i = 0; i < stats.errorCount; i++) {
    const idx = (stats.errorWriteIndex - 1 - i + ERROR_BUFFER_SIZE) % ERROR_BUFFER_SIZE
    filled.push(stats.recentErrors[idx])
  }
  return filled
}

/** Express middleware — call app.use(requestStatsMiddleware) */
function requestStatsMiddleware(req, res, next) {
  const start = process.hrtime.bigint()
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6
    recordRequest(Math.round(durationMs), res.statusCode)
  })
  next()
}

/** Reset all counters — used in tests to isolate state between suites */
function resetStats() {
  stats = createFreshStats()
}

module.exports = {
  recordRequest,
  recordError,
  getStats,
  getRecentErrors,
  requestStatsMiddleware,
  resetStats,
}
