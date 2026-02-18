const { AdminAuthService, AdminAuthServiceError } = require('../business/admin-auth/admin-auth.service');

const adminCtrl = {};
const adminAuthService = new AdminAuthService();

// Handle admin login using password-only credentials and session-based auth.
adminCtrl.login = async (req, res) => {
  try {
    const result = await adminAuthService.authenticate({
      password: req.body?.password,
      remember: req.body?.remember,
      session: req.session,
    });
    return res.json({ authenticated: result.authenticated });
  } catch (error) {
    if (error instanceof AdminAuthServiceError) {
      if (error.code === 'SESSION_REGENERATE_FAILED') {
        console.error('[admin] session regenerate failed', error);
      } else if (error.code === 'SESSION_SAVE_FAILED') {
        console.error('[admin] session save failed', error);
      }
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error('[admin] login failed', error);
    return res.status(500).json({ error: 'Auth error' });
  }
};

// Return the current admin session authentication status.
adminCtrl.getSession = (req, res) => {
  res.json({ authenticated: Boolean(req.session?.isAdmin) });
};

// Expose a protected admin-only endpoint for auth/middleware verification.
adminCtrl.getAdminHealth = (req, res) => {
  res.json({ status: 'admin ok' });
};

module.exports = adminCtrl;
