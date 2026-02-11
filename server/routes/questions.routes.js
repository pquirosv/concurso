const express = require('express');
const router = express.Router();

const photo = require('../controllers/photo.controller');

const CACHE_SECONDS_CITIES = Math.max(0, parseInt(process.env.CACHE_SECONDS_CITIES || '300', 10));
const CACHE_SECONDS_STATS = Math.max(0, parseInt(process.env.CACHE_SECONDS_STATS || '60', 10));

// Build a per-route cache middleware with max-age seconds (or no-store if disabled).
const cacheFor = (seconds) => (req, res, next) => {
    if (seconds <= 0) {
        res.set('Cache-Control', 'no-store');
        return next();
    }
    res.set('Cache-Control', `public, max-age=${seconds}`);
    next();
};

// Force no-store for endpoints where randomization must not be cached.
const noStore = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
};

router.get('/', photo.getPrueba);
router.get('/year', noStore, photo.getYearPhoto);
router.get('/city', noStore, photo.getCityPhoto);
router.get('/cities', cacheFor(CACHE_SECONDS_CITIES), photo.getCities);
router.get('/photos/count', cacheFor(CACHE_SECONDS_STATS), photo.getPhotosCount);
router.get('/photos/hasYearPhoto', cacheFor(CACHE_SECONDS_STATS), photo.hasYearPhoto);

module.exports = router;
