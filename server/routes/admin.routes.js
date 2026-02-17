const express = require('express');

const admin = require('../controllers/admin.controller');
const { requireAdmin } = require('../middlewares/admin-auth.middleware');
const { adminLoginRateLimit } = require('../middlewares/admin-login-rate-limit.middleware');

const router = express.Router();

router.post('/login', adminLoginRateLimit, admin.login);
router.post('/logout', admin.logout);
router.get('/session', admin.getSession);

router.use(requireAdmin);
router.get('/health', admin.getAdminHealth);

module.exports = router;
