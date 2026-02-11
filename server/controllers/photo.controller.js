const { getPhotoModel } = require('../models/photo');

const photoCtrl = {}

// Helper function to log and respond to database errors in a consistent way.
const respondDbError = (res, err, context) => {
    console.error(`[photos] ${context} failed`, err);
    res.status(500).json({ error: 'Database error' });
}

const RANDOM_POOL_SIZE = Math.max(1, parseInt(process.env.RANDOM_POOL_SIZE || '25', 10));
const randomPools = {
    year: { items: [], loading: null },
    city: { items: [], loading: null },
};

// Build the aggregation pipeline used to load a random sample pool.
const buildRandomPipeline = (field, size) => [
    { $match: { [field]: { $exists: true } } },
    { $sample: { size } },
    { $project: { name: 1, year: 1, city: 1 } },
];

// Fetch and normalize a random pool for the requested field.
const loadRandomPool = async (Photo, field) => {
    const pipeline = buildRandomPipeline(field, RANDOM_POOL_SIZE);
    const docs = await Photo.aggregate(pipeline);
    return Array.isArray(docs) ? docs : [];
};

// Serve a random photo from an in-memory pool, refilling when empty.
const getRandomPhotoByField = async (field) => {
    const pool = randomPools[field];
    if (!pool) {
        throw new Error(`Unknown random field: ${field}`);
    }

    if (pool.items.length === 0) {
        if (!pool.loading) {
            const Photo = getPhotoModel();
            pool.loading = loadRandomPool(Photo, field)
                .then((docs) => {
                    pool.items = docs;
                })
                .finally(() => {
                    pool.loading = null;
                });
        }
        await pool.loading;
    }

    return pool.items.pop() || null;
};

// Simple health/test endpoint to verify the photos API is reachable.
photoCtrl.getPrueba = (req, res) => {
    res.json({
        status: 'Photos goes here'
    });
}

// Return a random photo document that contains a year field.
photoCtrl.getYearPhoto = async (req, res) => {
    try {
        const photo = await getRandomPhotoByField('year');
        if (!photo) {
            return res.status(404).json({ error: 'No photo found with year' });
        }
        res.json(photo);
    } catch (err) {
        respondDbError(res, err, 'getYearPhoto');
    }
}

// Return a random photo document that contains a city field.
photoCtrl.getCityPhoto = async (req, res) => {
    try {
        const photo = await getRandomPhotoByField('city');
        if (!photo) {
            return res.status(404).json({ error: 'No photo found with city' });
        }
        res.json(photo);
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
