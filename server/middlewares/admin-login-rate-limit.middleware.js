const windowMs = Math.max(1000, parseInt(process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS || '600000', 10)); // Default to 10 minutes, minimum 1 second.
const maxAttempts = Math.max(3, parseInt(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX || '5', 10)); 
const cleanupIntervalMs = Math.max(windowMs, 60000);
const attemptBuckets = new Map(); // In-memory buckets for tracking login attempts per IP.

// Resolve a stable client key for per-IP admin login throttling.
const getClientKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

// Enforce a stricter fixed-window rate limit for admin login attempts.
const adminLoginRateLimit = (req, res, next) => {
  const now = Date.now();
  const key = getClientKey(req);
  let bucket = attemptBuckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { windowStart: now, count: 0 };
    attemptBuckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > maxAttempts) {
    const retryAfterSeconds = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    res.set('Retry-After', retryAfterSeconds.toString());
    return res.status(429).json({ error: 'Too many login attempts' });
  }

  next();
};

// Periodically remove expired login limiter buckets to keep memory bounded.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of attemptBuckets.entries()) {
    if (now - bucket.windowStart > windowMs) {
      attemptBuckets.delete(key);
    }
  }
}, cleanupIntervalMs);

if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

module.exports = {
  adminLoginRateLimit,
};
