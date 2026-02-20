const bcrypt = require('bcryptjs');

const {
  adminPasswordHash,
  adminSessionTtlMs,
} = require('../../config/admin-auth');

// Represent an expected admin auth business error with a status code and stable error code.
class AdminAuthServiceError extends Error {
  // Create an admin auth business error with an HTTP status code and machine-readable code.
  constructor(message, statusCode, code) {
    super(message);
    this.name = 'AdminAuthServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// Encapsulate password-based admin authentication and session lifecycle behavior.
class AdminAuthService {
  // Build an admin auth service with injectable dependencies for config and crypto.
  constructor({
    passwordHash = adminPasswordHash,
    sessionTtlMs = adminSessionTtlMs,
    bcryptLib = bcrypt,
  } = {}) {
    this.passwordHash = passwordHash;
    this.sessionTtlMs = sessionTtlMs;
    this.bcryptLib = bcryptLib;
  }

  // Authenticate an admin login attempt and persist session state when credentials are valid.
  async authenticate({ password, remember, session }) {
    const normalized = this.parseLoginBody({ password, remember });
    if (!normalized.password || !session) {
      throw new AdminAuthServiceError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    const valid = await this.isPasswordValid(normalized.password);
    if (!valid) {
      throw new AdminAuthServiceError('Invalid credentials', 401, 'INVALID_CREDENTIALS');
    }

    await this.regenerateSession(session);
    const activeSession = this.getActiveSession(session);
    activeSession.isAdmin = true;
    activeSession.authenticatedAt = Date.now();
    this.applySessionLifetime(activeSession, normalized.remember);
    await this.saveSession(activeSession);

    return {
      authenticated: true,
      remember: normalized.remember,
      authenticatedAt: activeSession.authenticatedAt,
    };
  }

  // Validate and normalize an incoming admin login payload.
  parseLoginBody(body) {
    const password = typeof body?.password === 'string' ? body.password : '';
    const remember = body?.remember !== false;
    return { password, remember };
  }

  // Ensure the configured admin password hash appears to be a bcrypt hash.
  hasValidPasswordHashFormat(hash) {
    return /^\$2[aby]\$\d{2}\$/.test(hash);
  }

  // Compare an incoming plaintext password against the configured bcrypt hash.
  async isPasswordValid(password) {
    if (!this.hasValidPasswordHashFormat(this.passwordHash)) {
      return false;
    }
    return this.bcryptLib.compare(password, this.passwordHash);
  }

  // Apply remember-me session persistence rules to the active express-session object.
  applySessionLifetime(session, remember) {
    if (remember) {
      session.cookie.maxAge = this.sessionTtlMs;
      return;
    }
    session.cookie.maxAge = undefined;
    session.cookie.expires = false;
  }

  // Regenerate the current session id to prevent fixation after successful login.
  regenerateSession(session) {
    return new Promise((resolve, reject) => {
      session.regenerate((error) => {
        if (error) {
          reject(new AdminAuthServiceError('Session error', 500, 'SESSION_REGENERATE_FAILED'));
          return;
        }
        resolve();
      });
    });
  }

  // Resolve the current active session object after express-session regeneration.
  getActiveSession(session) {
    return session?.req?.session || session;
  }

  // Persist the updated admin session and convert callback failures into typed service errors.
  saveSession(session) {
    return new Promise((resolve, reject) => {
      session.save((error) => {
        if (error) {
          reject(new AdminAuthServiceError('Session error', 500, 'SESSION_SAVE_FAILED'));
          return;
        }
        resolve();
      });
    });
  }
}

module.exports = {
  AdminAuthService,
  AdminAuthServiceError,
};
