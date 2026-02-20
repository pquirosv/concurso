describe('adminLoginRateLimit middleware', () => {
  const originalWindowMs = process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS;
  const originalMaxAttempts = process.env.ADMIN_LOGIN_RATE_LIMIT_MAX;

  // Build a minimal request object with a stable IP used for limiter bucketing.
  const createRequest = () => ({
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  });

  // Build a chainable response mock for middleware assertions.
  const createResponse = () => {
    const res = {
      set: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = '10000';
    process.env.ADMIN_LOGIN_RATE_LIMIT_MAX = '3';
    jest.resetModules();
  });

  afterEach(() => {
    jest.useRealTimers();

    if (originalWindowMs === undefined) {
      delete process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = originalWindowMs;
    }

    if (originalMaxAttempts === undefined) {
      delete process.env.ADMIN_LOGIN_RATE_LIMIT_MAX;
    } else {
      process.env.ADMIN_LOGIN_RATE_LIMIT_MAX = originalMaxAttempts;
    }
  });

  test('allows attempts up to maxAttempts and blocks the next one with Retry-After', () => {
    const { adminLoginRateLimit } = require('./admin-login-rate-limit.middleware');
    const req = createRequest();
    const res = createResponse();
    const next = jest.fn();

    adminLoginRateLimit(req, res, next);
    adminLoginRateLimit(req, res, next);
    adminLoginRateLimit(req, res, next);
    adminLoginRateLimit(req, res, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too many login attempts' });
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));

    const retryAfter = Number(res.set.mock.calls[0][1]);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(10);
  });

  test('returns a shorter Retry-After as the window approaches reset time', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-20T12:00:00.000Z'));

    const { adminLoginRateLimit } = require('./admin-login-rate-limit.middleware');
    const req = createRequest();
    const firstRes = createResponse();
    const secondRes = createResponse();
    const next = jest.fn();

    adminLoginRateLimit(req, firstRes, next);
    adminLoginRateLimit(req, firstRes, next);
    adminLoginRateLimit(req, firstRes, next);

    jest.advanceTimersByTime(4000);
    adminLoginRateLimit(req, firstRes, next);
    const firstRetryAfter = Number(firstRes.set.mock.calls[0][1]);

    jest.advanceTimersByTime(3000);
    adminLoginRateLimit(req, secondRes, next);
    const secondRetryAfter = Number(secondRes.set.mock.calls[0][1]);

    expect(firstRetryAfter).toBeGreaterThan(secondRetryAfter);
    expect(secondRetryAfter).toBeGreaterThan(0);
  });
});
