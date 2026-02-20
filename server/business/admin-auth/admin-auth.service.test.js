const { AdminAuthService, AdminAuthServiceError } = require('./admin-auth.service');

// Build a lightweight mock session object with controllable regenerate/save behavior.
const createSession = ({ regenerateError = null, saveError = null, replacementSession = null } = {}) => {
  const session = {
    cookie: {},
    regenerate(callback) {
      if (!regenerateError && replacementSession) {
        session.req.session = replacementSession;
      }
      callback(regenerateError);
    },
    save(callback) {
      callback(saveError);
    },
    req: { session: null },
  };
  session.req.session = session;
  return session;
};

describe('AdminAuthService', () => {
  test('parseLoginBody normalizes password and remember defaults', () => {
    const service = new AdminAuthService();

    expect(service.parseLoginBody({ password: 'secret' })).toEqual({ password: 'secret', remember: true });
    expect(service.parseLoginBody({ password: 123, remember: false })).toEqual({ password: '', remember: false });
  });

  test('hasValidPasswordHashFormat validates bcrypt prefixes', () => {
    const service = new AdminAuthService();

    expect(service.hasValidPasswordHashFormat('$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
    expect(service.hasValidPasswordHashFormat('not-a-hash')).toBe(false);
  });

  test('authenticate returns normalized auth result for valid credentials', async () => {
    const compare = jest.fn().mockResolvedValue(true);
    const service = new AdminAuthService({
      passwordHash: '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sessionTtlMs: 42,
      bcryptLib: { compare },
    });
    const session = createSession();

    const result = await service.authenticate({ password: 'valid-password', remember: true, session });

    expect(compare).toHaveBeenCalledWith('valid-password', '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result).toEqual(
      expect.objectContaining({
        authenticated: true,
        remember: true,
        authenticatedAt: expect.any(Number),
      })
    );
    expect(session.isAdmin).toBe(true);
    expect(session.cookie.maxAge).toBe(42);
  });

  test('authenticate uses the regenerated req.session object when available', async () => {
    const compare = jest.fn().mockResolvedValue(true);
    const service = new AdminAuthService({
      passwordHash: '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sessionTtlMs: 42,
      bcryptLib: { compare },
    });
    const replacementSession = createSession();
    const session = createSession({ replacementSession });

    await service.authenticate({ password: 'valid-password', remember: true, session });

    expect(session.isAdmin).toBeUndefined();
    expect(replacementSession.isAdmin).toBe(true);
    expect(replacementSession.cookie.maxAge).toBe(42);
  });

  test('authenticate throws typed invalid-credentials error when password is wrong', async () => {
    const service = new AdminAuthService({
      passwordHash: '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      bcryptLib: { compare: jest.fn().mockResolvedValue(false) },
    });

    await expect(service.authenticate({ password: 'bad', remember: true, session: createSession() })).rejects.toMatchObject({
      name: 'AdminAuthServiceError',
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    });
  });

  test('authenticate applies session-cookie behavior when remember is false', async () => {
    const service = new AdminAuthService({
      passwordHash: '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sessionTtlMs: 999,
      bcryptLib: { compare: jest.fn().mockResolvedValue(true) },
    });
    const session = createSession();

    await service.authenticate({ password: 'good', remember: false, session });

    expect(session.cookie.maxAge).toBeUndefined();
    expect(session.cookie.expires).toBe(false);
  });

  test('authenticate throws typed session error when regenerate fails', async () => {
    const service = new AdminAuthService({
      passwordHash: '$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      bcryptLib: { compare: jest.fn().mockResolvedValue(true) },
    });

    await expect(service.authenticate({
      password: 'good',
      remember: true,
      session: createSession({ regenerateError: new Error('boom') }),
    })).rejects.toMatchObject({
      name: 'AdminAuthServiceError',
      statusCode: 500,
      code: 'SESSION_REGENERATE_FAILED',
      message: 'Session error',
    });
  });

  test('saveSession throws typed session error when save fails', async () => {
    const service = new AdminAuthService();

    await expect(service.saveSession(createSession({ saveError: new Error('boom') }))).rejects.toBeInstanceOf(AdminAuthServiceError);
    await expect(service.saveSession(createSession({ saveError: new Error('boom') }))).rejects.toMatchObject({
      statusCode: 500,
      code: 'SESSION_SAVE_FAILED',
      message: 'Session error',
    });
  });
});
