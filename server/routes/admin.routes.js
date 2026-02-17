const express = require('express');

const admin = require('../controllers/admin.controller');
const adminPhotos = require('../controllers/admin-photos.controller');
const { requireAdmin } = require('../middlewares/admin-auth.middleware');
const { adminLoginRateLimit } = require('../middlewares/admin-login-rate-limit.middleware');

const router = express.Router();

router.post('/login', adminLoginRateLimit, admin.login);
router.get('/session', admin.getSession);

router.use(requireAdmin);
router.get('/health', admin.getAdminHealth);
router.get('/photos', adminPhotos.listPhotos);
router.get('/photos/:id', adminPhotos.getPhotoById);
router.post('/photos', adminPhotos.createPhoto);
router.patch('/photos/:id', adminPhotos.updatePhoto);
router.delete('/photos/:id', adminPhotos.deletePhoto);

module.exports = router;
