const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getPhotoModel } = require('../../models/photo');
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
    photoValidator = new PhotoValidator(),
    fileSystem = fs,
    pathModule = path,
    getPhotosDir = () => process.env.PHOTOS_DIR,
  } = {}) {
    this.photoModelFactory = photoModelFactory;
    this.photoValidator = photoValidator;
    this.fileSystem = fileSystem;
    this.pathModule = pathModule;
    this.getPhotosDir = getPhotosDir;
  }

  // Return the full admin list of photos for client-side table pagination.
  async listPhotos() {
    const Photo = this.photoModelFactory();
    const items = await Photo.find({}, { _id: 1, name: 1, year: 1, city: 1 }).sort({ _id: -1 }).lean();
    return items.map((item) => ({ _id: item._id, name: item.name, year: item.year, city: item.city }));
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

  // Create a new photo metadata record and persist the uploaded file with rollback on DB failures.
  async createPhoto(body, file) {
    if (!file || !file.buffer || !file.originalname) {
      throw new AdminPhotosServiceError('Photo file is required', 400);
    }

    const sanitizedName = this.buildStoredFilename(file.originalname);
    const { payload, error } = this.photoValidator.validatePayload({
      name: sanitizedName,
      year: body?.year,
      city: body?.city,
    }, 'create');
    if (error) {
      throw new AdminPhotosServiceError(error, 400);
    }

    const filePath = await this.writePhotoFile(sanitizedName, file.buffer);

    const Photo = this.photoModelFactory();
    try {
      const created = await Photo.create(payload);
      return {
        _id: created._id,
        name: created.name,
        year: created.year,
        city: created.city,
      };
    } catch (error) {
      await this.cleanupFileAfterDbFailure(filePath);
      throw error;
    }
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

  // Delete a photo metadata record and remove its file from disk when present.
  async deletePhoto(id) {
    const photoId = this.validatePhotoId(id);
    const Photo = this.photoModelFactory();
    const deleted = await Photo.findByIdAndDelete(photoId, { projection: { name: 1 } }).lean();
    if (!deleted) {
      throw new AdminPhotosServiceError('Photo not found', 404);
    }

    const file = await this.removePhotoFile(deleted.name);
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

  // Generate a safe unique stored filename preserving the original extension.
  buildStoredFilename(originalname) {
    const ext = this.pathModule.extname(originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
    const safeExt = ext && ext.length <= 10 ? ext : '';
    return `${Date.now()}-${crypto.randomUUID()}${safeExt}`;
  }

  // Persist an uploaded photo buffer into the configured writable photo directory.
  async writePhotoFile(photoName, buffer) {
    const photosDir = this.getPhotosDir();
    if (!photosDir) {
      throw new AdminPhotosServiceError('PHOTOS_DIR is not configured', 500);
    }

    const filePath = this.resolvePhotoPath(photosDir, photoName);
    await this.fileSystem.promises.writeFile(filePath, buffer);
    return filePath;
  }

  // Remove a just-written file when the DB insert fails to keep create flows transactional.
  async cleanupFileAfterDbFailure(filePath) {
    try {
      await this.fileSystem.promises.unlink(filePath);
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        console.error('[admin-photos] cleanup file failed after db insert error', error);
      }
    }
  }

  // Resolve and validate a photo file path so file operations stay inside the configured base directory.
  resolvePhotoPath(baseDirInput, photoName) {
    const baseDir = this.pathModule.resolve(baseDirInput);
    const filePath = this.pathModule.resolve(baseDir, photoName);
    const relative = this.pathModule.relative(baseDir, filePath);
    if (relative.startsWith('..') || this.pathModule.isAbsolute(relative)) {
      throw new AdminPhotosServiceError('Invalid photo path', 400);
    }
    return filePath;
  }

  // Remove the photo file from PHOTOS_DIR using the stored filename and report the outcome.
  async removePhotoFile(photoName) {
    if (!photoName) {
      return { requested: true, deleted: false, warning: 'Photo name is missing' };
    }

    const photosDir = this.getPhotosDir();
    if (!photosDir) {
      return { requested: true, deleted: false, warning: 'PHOTOS_DIR is not configured' };
    }

    try {
      const filePath = this.resolvePhotoPath(photosDir, photoName);
      await this.fileSystem.promises.unlink(filePath);
      return { requested: true, deleted: true };
    } catch (err) {
      if (err instanceof AdminPhotosServiceError) {
        return { requested: true, deleted: false, warning: err.message };
      }
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
