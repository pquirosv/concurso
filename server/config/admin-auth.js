// Parse an integer environment value and clamp it to a minimum value.
const parseEnvInt = (value, fallback, min) => {
  const parsed = parseInt(value || `${fallback}`, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.max(min, parsed);
};

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const adminSessionTtlDays = parseEnvInt(process.env.ADMIN_SESSION_TTL_DAYS, 7, 1);
const adminSessionTtlMs = adminSessionTtlDays * 24 * 60 * 60 * 1000;

// Validate required admin auth environment variables before app startup.
const validateAdminAuthEnv = () => {
  if (isTest) {
    return;
  }

  const missing = [];
  if (!process.env.SESSION_COOKIE_SECRET) {
    missing.push('SESSION_COOKIE_SECRET');
  }
  if (!process.env.ADMIN_PASSWORD_HASH) {
    missing.push('ADMIN_PASSWORD_HASH');
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

module.exports = {
  adminSessionCookieName: 'admin_sid',
  adminSessionTtlDays,
  adminSessionTtlMs,
  adminSessionCollection: 'admin_sessions',
  sessionSecret: process.env.SESSION_COOKIE_SECRET || 'test-session-secret',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  isProduction,
  isTest,
  validateAdminAuthEnv,
};
