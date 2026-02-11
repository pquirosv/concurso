const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const app = express();

const { mongoose } = require('./database');

// Settings 
app.set('port', process.env.PORT || 3000);
app.set('trust proxy', 1);

const RATE_LIMIT_WINDOW_MS = Math.max(1000, parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10));
const RATE_LIMIT_MAX = Math.max(1, parseInt(process.env.RATE_LIMIT_MAX || '120', 10));
const RATE_LIMIT_CLEANUP_INTERVAL_MS = Math.max(RATE_LIMIT_WINDOW_MS, 60000);
const rateLimitBuckets = new Map();

// Resolve a stable client key for rate limiting (supports proxies).
const getClientKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

// In-memory fixed-window rate limiter with standard response headers.
const rateLimiter = (req, res, next) => {
  const now = Date.now();
  const key = getClientKey(req);
  let bucket = rateLimitBuckets.get(key);

  // If no bucket exists or current window expired, create/reset it
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    bucket = { windowStart: now, count: 0 };
    rateLimitBuckets.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, RATE_LIMIT_MAX - bucket.count);

  // Add standard rate limit headers
  res.set('RateLimit-Limit', RATE_LIMIT_MAX.toString());
  res.set('RateLimit-Remaining', remaining.toString());
  const retryAfterSeconds = Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
  res.set('RateLimit-Reset', retryAfterSeconds.toString());

  // If limit exceeded, respond with 429 and Retry-After header
  if (bucket.count > RATE_LIMIT_MAX) {
    res.set('Retry-After', retryAfterSeconds.toString());
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  next();
};

// Periodically drop expired rate-limit buckets to avoid unbounded growth.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitBuckets.delete(key);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL_MS);

if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

// Middlewares
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:8080'],
  })
);

app.use(rateLimiter);
app.use(morgan('tiny')); //'Combined' para log largo
app.use(express.json());

// Routes
app.use('/api',require('./routes/questions.routes'));

// Starting the server
app.listen(app.get('port'), () => {
	console.log('Server en ' + app.get('port') + '...');
});
