// Build a fixed-window in-memory rate limiter middleware with periodic bucket cleanup.
const createRateLimiter = (config = {}) => {
  const windowMs = Math.max(1000, parseInt(config.windowMs ?? process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10));
  const maxRequests = Math.max(1, parseInt(config.maxRequests ?? process.env.RATE_LIMIT_MAX ?? '120', 10));
  const cleanupIntervalMs = Math.max(windowMs, 60000);
  const rateLimitBuckets = new Map();

  // Resolve a stable client key for rate limiting (supports proxies).
  const getClientKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

  // Enforce a fixed-window rate limit and set standard response headers.
  const rateLimiter = (req, res, next) => {
    const now = Date.now();
    const key = getClientKey(req);
    let bucket = rateLimitBuckets.get(key);

    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = { windowStart: now, count: 0 };
      rateLimitBuckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, maxRequests - bucket.count);

    res.set('RateLimit-Limit', maxRequests.toString());
    res.set('RateLimit-Remaining', remaining.toString());
    const retryAfterSeconds = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    res.set('RateLimit-Reset', retryAfterSeconds.toString());

    if (bucket.count > maxRequests) {
      res.set('Retry-After', retryAfterSeconds.toString());
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    next();
  };

  // Periodically drop expired rate-limit buckets to avoid unbounded growth.
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of rateLimitBuckets.entries()) {
      if (now - bucket.windowStart > windowMs) {
        rateLimitBuckets.delete(key);
      }
    }
  }, cleanupIntervalMs);

  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }

  return rateLimiter;
};

module.exports = {
  createRateLimiter,
};
