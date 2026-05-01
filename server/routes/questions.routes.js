const express = require('express');
const router = express.Router();

const photo = require('../controllers/photo.controller');

// Force no-store for endpoints where randomization must not be cached.
const noStore = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
};

router.get('/', photo.getPrueba);
router.get('/year', noStore, photo.getYearPhoto);
router.get('/city', noStore, photo.getCityPhoto);
router.get('/cities', noStore, photo.getCities);
router.get('/photos/count', noStore, photo.getPhotosCount);
router.get('/photos/hasYearPhoto', noStore, photo.hasYearPhoto);
router.get('/photos/file/:name', noStore, photo.getPhotoFile);

module.exports = router;
