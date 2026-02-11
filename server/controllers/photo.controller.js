const { getPhotoModel } = require('../models/photo');

const photoCtrl = {}

// Helper function to log and respond to database errors in a consistent way.
const respondDbError = (res, err, context) => {
    console.error(`[photos] ${context} failed`, err);
    res.status(500).json({ error: 'Database error' });
}

// Simple health/test endpoint to verify the photos API is reachable.
photoCtrl.getPrueba = (req, res) => {
    res.json({
        status: 'Photos goes here'
    });
}

// Return a random photo document that contains a year field.
photoCtrl.getYearPhoto = async (req, res) => {
    try {
        const Photo = getPhotoModel();
        const photo = await Photo.aggregate([{ $match: { year: { $exists: true } } }, { $sample: { size: 1 } }]);
        if (!photo || photo.length === 0) {
            return res.status(404).json({ error: 'No photo found with year' });
        }
        res.json(photo[0]);
    } catch (err) {
        respondDbError(res, err, 'getYearPhoto');
    }
}

// Return a random photo document that contains a city field.
photoCtrl.getCityPhoto = async (req, res) => {
    try {
        const Photo = getPhotoModel();
        const photo = await Photo.aggregate([{ $match: { city: { $exists: true } } }, { $sample: { size: 1 } }]);
        if (!photo || photo.length === 0) {
            return res.status(404).json({ error: 'No photo found with city' });
        }
        res.json(photo[0]);
    } catch (err) {
        respondDbError(res, err, 'getCityPhoto');
    }
}

// Return the total number of photo documents in the active dataset.
photoCtrl.getPhotosCount = async (req, res) => {
    try {
        const Photo = getPhotoModel();
        const count = await Photo.countDocuments({});
        res.json({ count });
    } catch (err) {
        respondDbError(res, err, 'getPhotosCount');
    }
}

// Return all the cities that appear in the photos dataset.
photoCtrl.getCities = async (req, res) => {
    try {
        const Photo = getPhotoModel();
        const cities = await Photo.distinct('city', { city: { $exists: true } });
        res.json(cities);
    } catch (err) {
        respondDbError(res, err, 'getCities');
    }
}

// Return a boolean indicating if there are at least one photo that has the field year.
photoCtrl.hasYearPhoto = async (req, res) => {
    try {
        const Photo = getPhotoModel();
        const count = await Photo.countDocuments({ year: { $exists: true } });
        res.json({ hasYearPhoto: count > 0 });
    } catch (err) {
        respondDbError(res, err, 'hasYearPhoto');
    }
}

module.exports = photoCtrl;
