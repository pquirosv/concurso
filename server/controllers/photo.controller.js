const { PhotosService, PhotosServiceError } = require('../business/photos/photos.service');

const photoCtrl = {}
const photosService = new PhotosService();

// Helper function to log and respond to database errors in a consistent way.
const respondServiceError = (res, err, context) => {
    if (err instanceof PhotosServiceError && err.code === 'INVALID_RANDOM_FIELD') {
        return res.status(400).json({ error: err.message });
    }

    console.error(`[photos] ${context} failed`, err);
    res.status(500).json({ error: 'Database error' });
}

// Simple health/test endpoint to verify the photos API is reachable.
photoCtrl.getPrueba = (req, res) => {
    res.json({
        status: 'Photos goes here'
    });
}

// Initialize random pools used by the quiz and return the pool size.
photoCtrl.startQuizRound = async (req, res) => {
    try {
        await photosService.initializeRandomPools();
        res.json({ poolSize: photosService.getRandomPoolSize() });
    } catch (err) {
        respondServiceError(res, err, 'startQuizRound');
    }
}

// Return a random photo document that contains a year field.
photoCtrl.getYearPhoto = async (req, res) => {
    try {
        const photo = await photosService.getRandomYearPhoto();
        if (!photo) {
            return res.status(404).json({ error: 'No photo found with year' });
        }
        res.json(photo);
    } catch (err) {
        respondServiceError(res, err, 'getYearPhoto');
    }
}

// Return a random photo document that contains a city field.
photoCtrl.getCityPhoto = async (req, res) => {
    try {
        const photo = await photosService.getRandomCityPhoto();
        if (!photo) {
            return res.status(404).json({ error: 'No photo found with city' });
        }
        res.json(photo);
    } catch (err) {
        respondServiceError(res, err, 'getCityPhoto');
    }
}

// Return the total number of photo documents in the active dataset.
photoCtrl.getPhotosCount = async (req, res) => {
    try {
        const count = await photosService.getPhotosCount();
        res.json({ count });
    } catch (err) {
        respondServiceError(res, err, 'getPhotosCount');
    }
}

// Return all the cities that appear in the photos dataset.
photoCtrl.getCities = async (req, res) => {
    try {
        const cities = await photosService.getCities();
        res.json(cities);
    } catch (err) {
        respondServiceError(res, err, 'getCities');
    }
}

// Return a boolean indicating if there are at least one photo that has the field year.
photoCtrl.hasYearPhoto = async (req, res) => {
    try {
        const hasYearPhoto = await photosService.hasYearPhoto();
        res.json({ hasYearPhoto });
    } catch (err) {
        respondServiceError(res, err, 'hasYearPhoto');
    }
}

module.exports = photoCtrl;
