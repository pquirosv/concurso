// Reject requests that do not have an authenticated admin session.
const requireAdmin = (req, res, next) => {
  if (req.session?.isAdmin) {
    return next();
  }
  return res.status(401).json({ authenticated: false, error: 'Unauthorized' });
};

module.exports = {
  requireAdmin,
};
