const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');

const {
  adminSessionCollection,
  adminSessionCookieName,
  adminSessionTtlDays,
  adminSessionTtlMs,
  isProduction,
  sessionSecret,
  validateAdminAuthEnv,
} = require('./config/admin-auth');

validateAdminAuthEnv();
require('./database');

const app = express();

// Settings 
app.set('port', process.env.PORT || 3000);
app.set('trust proxy', 1);

const RATE_LIMIT_WINDOW_MS = Math.max(1000, parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10));
const RATE_LIMIT_MAX = Math.max(1, parseInt(process.env.RATE_LIMIT_MAX || '120', 10));
const RATE_LIMIT_CLEANUP_INTERVAL_MS = Math.max(RATE_LIMIT_WINDOW_MS, 60000);
const rateLimitBuckets = new Map();
const allowedOrigins = ['http://localhost:5173', 'http://localhost:8080'];
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/concurso';

const sessionStore = MongoStore.create({
  mongoUrl: mongoUri,
  collectionName: adminSessionCollection,
  ttl: adminSessionTtlDays * 24 * 60 * 60,
  autoRemove: 'native',
});

// Resolve a stable client key for rate limiting (supports proxies).
const getClientKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

// Check if the request Origin is allowed for credentialed CORS.
const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(origin);

// Dynamically validate origin for credentialed CORS requests.
const corsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error('Not allowed by CORS'));
};

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
    origin: corsOrigin,
    credentials: true,
  })
);

app.use(rateLimiter);
app.use(morgan('tiny')); // 'Combined' para log largo
app.use(express.json());
app.use(
  session({
    name: adminSessionCookieName,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: adminSessionTtlMs,
    },
  })
);

// Routes
app.use('/api', require('./routes/questions.routes'));
app.use('/api/admin', require('./routes/admin.routes'));

module.exports = app;
