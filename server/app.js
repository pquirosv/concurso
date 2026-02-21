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
const { validatePhotoStorageEnv } = require('./config/photo-storage');
const { createRateLimiter } = require('./middlewares/rate-limit.middleware');

validateAdminAuthEnv();
validatePhotoStorageEnv();
require('./database');

const app = express();

// Settings 
app.set('port', process.env.PORT || 3000);
app.set('trust proxy', 1);

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS || ['http://localhost:5173', 'http://localhost:8080'];
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/concurso';

const sessionStore = MongoStore.create({
  mongoUrl: mongoUri,
  collectionName: adminSessionCollection,
  ttl: adminSessionTtlDays * 24 * 60 * 60,
  autoRemove: 'native',
});

// Resolve active CORS origins from env when present, otherwise fallback to hardcoded local origins.
const resolveAllowedOrigins = () => {
  try {
    const parsed = JSON.parse(allowedOrigins);
    if (Array.isArray(parsed) && parsed.every((o) => typeof o === 'string')) {
      return parsed;
    }
    if (typeof parsed === 'string') {
      return [parsed];
    }
  } catch (error) {
    console.error('Failed to parse allowedOrigins:', error);
  }
  return allowedOrigins;
};

const activeAllowedOrigins = resolveAllowedOrigins();

// Check if the request Origin is allowed for credentialed CORS.
const isAllowedOrigin = (origin) => !origin || activeAllowedOrigins.includes(origin);

// Dynamically validate origin for credentialed CORS requests.
const corsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error('Not allowed by CORS'));
};

// Build the app-wide API rate limiter with environment-driven defaults.
const rateLimiter = createRateLimiter();

// Middlewares
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ['Retry-After'],
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
