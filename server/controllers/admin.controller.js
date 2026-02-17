const bcrypt = require('bcryptjs');

const {
  adminPasswordHash,
  adminSessionCookieName,
  adminSessionTtlMs,
  isProduction,
} = require('../config/admin-auth');

const adminCtrl = {};

// Return a generic invalid-credentials response without leaking auth details.
const sendInvalidCredentials = (res) => res.status(401).json({ error: 'Invalid credentials' });

// Validate and normalize the incoming admin login request body.
const parseLoginBody = (body) => {
  const password = typeof body?.password === 'string' ? body.password : '';
  const remember = body?.remember !== false;
  return { password, remember };
};

// Ensure the configured admin password hash appears to be a bcrypt hash.
const hasValidPasswordHashFormat = (hash) => /^\$2[aby]\$\d{2}\$/.test(hash);

// Compare the provided password against the configured admin password hash.
const isPasswordValid = async (password) => {
  if (!hasValidPasswordHashFormat(adminPasswordHash)) {
    return false;
  }
  return bcrypt.compare(password, adminPasswordHash);
};

// Set the session cookie lifetime according to remember-me selection.
const applySessionLifetime = (session, remember) => {
  if (remember) {
    session.cookie.maxAge = adminSessionTtlMs;
    return;
  }
  session.cookie.maxAge = undefined;
  session.cookie.expires = false;
};

// Handle admin login using password-only credentials and session-based auth.
adminCtrl.login = async (req, res) => {
  try {
    const { password, remember } = parseLoginBody(req.body);
    if (!password || !req.session) {
      return sendInvalidCredentials(res);
    }

    const valid = await isPasswordValid(password);
    if (!valid) {
      return sendInvalidCredentials(res);
    }

    req.session.regenerate((regenerateErr) => {
      if (regenerateErr) {
        console.error('[admin] session regenerate failed', regenerateErr);
        return res.status(500).json({ error: 'Session error' });
      }

      req.session.isAdmin = true;
      req.session.authenticatedAt = Date.now();
      applySessionLifetime(req.session, remember);

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[admin] session save failed', saveErr);
          return res.status(500).json({ error: 'Session error' });
        }
        return res.json({ authenticated: true });
      });
    });
  } catch (err) {
    console.error('[admin] login failed', err);
    return res.status(500).json({ error: 'Auth error' });
  }
};

// Return the current admin session authentication status.
adminCtrl.getSession = (req, res) => {
  res.json({ authenticated: Boolean(req.session?.isAdmin) });
};

// Destroy the current admin session and clear the auth cookie.
adminCtrl.logout = (req, res) => {
  if (!req.session) {
    res.clearCookie(adminSessionCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    });
    return res.json({ authenticated: false });
  }

  req.session.destroy((destroyErr) => {
    if (destroyErr) {
      console.error('[admin] session destroy failed', destroyErr);
      return res.status(500).json({ error: 'Session error' });
    }
    res.clearCookie(adminSessionCookieName, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    });
    return res.json({ authenticated: false });
  });
};

// Expose a protected admin-only endpoint for auth/middleware verification.
adminCtrl.getAdminHealth = (req, res) => {
  res.json({ status: 'admin ok' });
};

module.exports = adminCtrl;
