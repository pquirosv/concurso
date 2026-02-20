const { getPhotoModel } = require('../../models/photo');

const RANDOM_POOL_SIZE = Math.max(1, parseInt(process.env.RANDOM_POOL_SIZE || '25', 10));

// Domain error used to map service failures into HTTP responses.
class PhotosServiceError extends Error {
    // Build a typed error with a stable code and optional details.
    constructor(code, message, details = null) {
        super(message);
        this.name = 'PhotosServiceError';
        this.code = code;
        this.details = details;
    }
}

// Service that contains photo business logic and data access operations.
class PhotosService {
    // Initialize shared random pools used by random photo queries.
    constructor() {
        this.randomPools = {
            year: { items: [], loading: null },
            city: { items: [], loading: null },
        };
    }

    // Build the aggregation pipeline used to load a random sample pool.
    buildRandomPipeline(field, size) {
        return [
            { $match: { [field]: { $exists: true } } },
            { $sample: { size } },
            { $project: { name: 1, year: 1, city: 1 } },
        ];
    }

    // Fetch and normalize a random pool for the requested field.
    async loadRandomPool(field) {
        const Photo = getPhotoModel();
        const pipeline = this.buildRandomPipeline(field, RANDOM_POOL_SIZE);
        const docs = await Photo.aggregate(pipeline);
        return Array.isArray(docs) ? docs : [];
    }

    // Serve a random photo from an in-memory pool, refilling when empty.
    async getRandomPhotoByField(field) {
        const pool = this.randomPools[field];
        if (!pool) {
            throw new PhotosServiceError('INVALID_RANDOM_FIELD', `Unknown random field: ${field}`, { field });
        }

        if (pool.items.length === 0) {
            if (!pool.loading) {
                pool.loading = this.loadRandomPool(field)
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
    }

    // Get a random photo that contains a year field.
    async getRandomYearPhoto() {
        return this.getRandomPhotoByField('year');
    }

    // Get a random photo that contains a city field.
    async getRandomCityPhoto() {
        return this.getRandomPhotoByField('city');
    }

    // Count all photo documents from the active dataset.
    async getPhotosCount() {
        const Photo = getPhotoModel();
        return Photo.countDocuments({});
    }

    // Read all distinct cities from the photo dataset.
    async getCities() {
        const Photo = getPhotoModel();
        return Photo.distinct('city', { city: { $exists: true } });
    }

    // Check whether at least one photo has a year field.
    async hasYearPhoto() {
        const Photo = getPhotoModel();
        const exists = await Photo.exists({ year: { $exists: true } });
        return Boolean(exists);
    }
}

module.exports = { PhotosService, PhotosServiceError };
