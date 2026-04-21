const path = require('path');

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
    constructor({
        photoModelFactory = getPhotoModel,
        getPhotosDir = () => process.env.PHOTOS_DIR,
        pathModule = path,
    } = {}) {
        this.photoModelFactory = photoModelFactory;
        this.getPhotosDir = getPhotosDir;
        this.pathModule = pathModule;
        this.randomPools = {
            public: {
                year: { items: [], loading: null },
                city: { items: [], loading: null },
            },
            admin: {
                year: { items: [], loading: null },
                city: { items: [], loading: null },
            },
        };
    }

    // Convert a request auth state into the named photo visibility scope.
    getScope(isAdmin = false) {
        return isAdmin ? 'admin' : 'public';
    }

    // Return the base Mongo filter for the requested visibility scope.
    buildScopeFilter(scope) {
        return scope === 'admin' ? {} : { isPublic: true };
    }

    // Build the aggregation pipeline used to load a random sample pool.
    buildRandomPipeline(field, size, scope = 'public') {
        return [
            { $match: { ...this.buildScopeFilter(scope), [field]: { $exists: true } } },
            { $sample: { size } },
            { $project: { name: 1, year: 1, city: 1, isPublic: 1 } },
        ];
    }

    // Fetch and normalize a random pool for the requested field.
    async loadRandomPool(field, scope) {
        const Photo = this.photoModelFactory();
        const pipeline = this.buildRandomPipeline(field, RANDOM_POOL_SIZE, scope);
        const docs = await Photo.aggregate(pipeline);
        return Array.isArray(docs) ? docs : [];
    }

    // Serve a random photo from an in-memory pool, refilling when empty.
    async getRandomPhotoByField(field, isAdmin = false) {
        const scope = this.getScope(isAdmin);
        const pool = this.randomPools[scope]?.[field];
        if (!pool) {
            throw new PhotosServiceError('INVALID_RANDOM_FIELD', `Unknown random field: ${field}`, { field });
        }

        if (pool.items.length === 0) {
            if (!pool.loading) {
                pool.loading = this.loadRandomPool(field, scope)
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
    async getRandomYearPhoto(isAdmin = false) {
        return this.getRandomPhotoByField('year', isAdmin);
    }

    // Get a random photo that contains a city field.
    async getRandomCityPhoto(isAdmin = false) {
        return this.getRandomPhotoByField('city', isAdmin);
    }

    // Count all photo documents from the active dataset.
    async getPhotosCount(isAdmin = false) {
        const Photo = this.photoModelFactory();
        return Photo.countDocuments(this.buildScopeFilter(this.getScope(isAdmin)));
    }

    // Read all distinct cities from the photo dataset.
    async getCities(isAdmin = false) {
        const Photo = this.photoModelFactory();
        return Photo.distinct('city', { ...this.buildScopeFilter(this.getScope(isAdmin)), city: { $exists: true } });
    }

    // Check whether at least one photo has a year field.
    async hasYearPhoto(isAdmin = false) {
        const Photo = this.photoModelFactory();
        const exists = await Photo.exists({ ...this.buildScopeFilter(this.getScope(isAdmin)), year: { $exists: true } });
        return Boolean(exists);
    }

    // Resolve an allowed photo file path for the current visibility scope.
    async getAllowedPhotoFile(photoName, isAdmin = false) {
        const safeName = this.normalizePhotoName(photoName);
        if (!safeName) {
            return null;
        }

        const Photo = this.photoModelFactory();
        const photo = await Photo.findOne(
            { ...this.buildScopeFilter(this.getScope(isAdmin)), name: safeName },
            { _id: 1, name: 1 }
        ).lean();
        if (!photo) {
            return null;
        }

        return this.resolvePhotoPath(safeName);
    }

    // Normalize a URL path parameter into a safe stored filename.
    normalizePhotoName(photoName) {
        if (typeof photoName !== 'string' || !photoName.trim()) {
            return null;
        }
        const decoded = decodeURIComponent(photoName);
        return decoded === this.pathModule.basename(decoded) ? decoded : null;
    }

    // Build an absolute photo path confined inside PHOTOS_DIR.
    resolvePhotoPath(photoName) {
        const photosDir = this.getPhotosDir();
        if (!photosDir) {
            throw new PhotosServiceError('PHOTOS_DIR_NOT_CONFIGURED', 'PHOTOS_DIR is not configured');
        }

        const baseDir = this.pathModule.resolve(photosDir);
        const filePath = this.pathModule.resolve(baseDir, photoName);
        const relative = this.pathModule.relative(baseDir, filePath);
        if (relative.startsWith('..') || this.pathModule.isAbsolute(relative)) {
            return null;
        }
        return filePath;
    }
}

module.exports = { PhotosService, PhotosServiceError };
