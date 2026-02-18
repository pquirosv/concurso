const fs = require('fs');
const path = require('path');

const { getPhotoModel } = require('../../models/photo');
const { PaginationQuery } = require('./utils/pagination-query');
const { PhotoValidator } = require('./utils/photo-validator');

// Represent an expected business error with an HTTP status code.
class AdminPhotosServiceError extends Error {
  // Create a business-layer error with status and user-facing message.
  constructor(message, statusCode) {
    super(message);
    this.name = 'AdminPhotosServiceError';
    this.statusCode = statusCode;
  }
}

// Encapsulate all admin photo CRUD business logic.
class AdminPhotosService {
  // Build an admin photo service with default dependencies.
  constructor({
    photoModelFactory = getPhotoModel,
    paginationQuery = new PaginationQuery(),
    photoValidator = new PhotoValidator(),
    fileSystem = fs,
    pathModule = path,
    getPhotosDir = () => process.env.PHOTOS_DIR,
  } = {}) {
    this.photoModelFactory = photoModelFactory;
    this.paginationQuery = paginationQuery;
    this.photoValidator = photoValidator;
    this.fileSystem = fileSystem;
    this.pathModule = pathModule;
    this.getPhotosDir = getPhotosDir;
  }

  // Return a paginated admin list of photos with sorting support.
  async listPhotos(query) {
    const Photo = this.photoModelFactory();
    const { page, limit, skip } = this.paginationQuery.parsePagination(query);
    const sort = this.paginationQuery.parseSort(query);

    const [items, total] = await Promise.all([
      Photo.find({}, { _id: 1, name: 1, year: 1, city: 1 }).sort(sort).skip(skip).limit(limit).lean(),
      Photo.countDocuments({}),
    ]);

    return {
      items: items.map((item) => ({ _id: item._id, name: item.name, year: item.year, city: item.city })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // Return one photo record by id for admin edit workflows.
  async getPhotoById(id) {
    const photoId = this.validatePhotoId(id);
    const Photo = this.photoModelFactory();
    const photo = await Photo.findById(photoId, { _id: 1, name: 1, year: 1, city: 1 }).lean();
    if (!photo) {
      throw new AdminPhotosServiceError('Photo not found', 404);
    }
    return { _id: photo._id, name: photo.name, year: photo.year, city: photo.city };
  }

  // Create a new photo metadata record for admin management.
  async createPhoto(body) {
    const { payload, error } = this.photoValidator.validatePayload(body, 'create');
    if (error) {
      throw new AdminPhotosServiceError(error, 400);
    }

    const Photo = this.photoModelFactory();
    const created = await Photo.create(payload);
    return {
      _id: created._id,
      name: created.name,
      year: created.year,
      city: created.city,
    };
  }

  // Update an existing photo metadata record fields for admin edits.
  async updatePhoto(id, body) {
    const photoId = this.validatePhotoId(id);
    const { payload, error } = this.photoValidator.validatePayload(body, 'update');
    if (error) {
      throw new AdminPhotosServiceError(error, 400);
    }

    const Photo = this.photoModelFactory();
    const updated = await Photo.findByIdAndUpdate(photoId, payload, {
      new: true,
      runValidators: true,
      projection: { _id: 1, name: 1, year: 1, city: 1 },
    }).lean();

    if (!updated) {
      throw new AdminPhotosServiceError('Photo not found', 404);
    }

    return { _id: updated._id, name: updated.name, year: updated.year, city: updated.city };
  }

  // Delete a photo metadata record and optionally remove its file from disk.
  async deletePhoto(id, query) {
    const photoId = this.validatePhotoId(id);
    const Photo = this.photoModelFactory();
    const deleted = await Photo.findByIdAndDelete(photoId, { projection: { name: 1 } }).lean();
    if (!deleted) {
      throw new AdminPhotosServiceError('Photo not found', 404);
    }

    const file = await this.removePhotoFileIfRequested(query, deleted.name);
    return { deleted: true, file };
  }

  // Validate and convert a string id into a Mongo ObjectId.
  validatePhotoId(id) {
    const photoId = this.photoValidator.parseObjectId(id);
    if (!photoId) {
      throw new AdminPhotosServiceError('Invalid photo id', 400);
    }
    return photoId;
  }

  // Try to remove the photo file from PHOTOS_DIR using the stored filename.
  async removePhotoFileIfRequested(query, photoName) {
    const shouldDeleteFile = String(query?.deleteFile || '').toLowerCase() === 'true';
    if (!shouldDeleteFile || !photoName) {
      return { requested: shouldDeleteFile, deleted: false };
    }

    const photosDir = this.getPhotosDir();
    if (!photosDir) {
      return { requested: true, deleted: false, warning: 'PHOTOS_DIR is not configured' };
    }

    const baseDir = this.pathModule.resolve(photosDir);
    const filePath = this.pathModule.resolve(baseDir, photoName);
    const relative = this.pathModule.relative(baseDir, filePath);
    if (relative.startsWith('..') || this.pathModule.isAbsolute(relative)) {
      return { requested: true, deleted: false, warning: 'Invalid photo path' };
    }

    try {
      await this.fileSystem.promises.unlink(filePath);
      return { requested: true, deleted: true };
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return { requested: true, deleted: false, warning: 'Photo file does not exist' };
      }
      console.error('[admin-photos] delete file failed', err);
      return { requested: true, deleted: false, warning: 'Failed to delete photo file' };
    }
  }
}

module.exports = {
  AdminPhotosService,
  AdminPhotosServiceError,
};
