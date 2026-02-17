const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const { getPhotoModel } = require('../models/photo');

const adminPhotosCtrl = {};

const ALLOWED_SORT_FIELDS = new Set(['name', 'year', 'city', '_id']);

// Parse a positive integer query parameter with a fallback value.
const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

// Parse and clamp pagination inputs used by admin photo list queries.
const parsePaginationQuery = (query) => {
  const page = parsePositiveInt(query?.page, 1);
  const limit = Math.min(parsePositiveInt(query?.limit, 25), 100);
  return { page, limit, skip: (page - 1) * limit };
};

// Parse the sort query into a Mongo sort object with safe defaults.
const parseSortQuery = (query) => {
  const sortBy = typeof query?.sortBy === 'string' ? query.sortBy : '_id';
  const sortDir = query?.sortDir === 'asc' ? 1 : -1;
  if (!ALLOWED_SORT_FIELDS.has(sortBy)) {
    return { _id: -1 };
  }
  return { [sortBy]: sortDir, _id: -1 };
};

// Validate and normalize create/update payload fields for photo metadata.
const parsePhotoPayload = (body, mode = 'create') => {
  const payload = {};
  const hasName = Object.prototype.hasOwnProperty.call(body || {}, 'name');
  const hasYear = Object.prototype.hasOwnProperty.call(body || {}, 'year');
  const hasCity = Object.prototype.hasOwnProperty.call(body || {}, 'city');

  if (mode === 'create' && !hasName) {
    return { error: 'Name is required' };
  }

  if (hasName) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return { error: 'Name must be a non-empty string' };
    }
    payload.name = body.name.trim();
  }

  if (hasYear) {
    if (body.year === null || body.year === '') {
      payload.year = undefined;
    } else {
      const parsedYear = Number(body.year);
      if (!Number.isInteger(parsedYear) || parsedYear < 0) {
        return { error: 'Year must be a positive integer or null' };
      }
      payload.year = parsedYear;
    }
  }

  if (hasCity) {
    if (body.city === null || body.city === '') {
      payload.city = undefined;
    } else if (typeof body.city !== 'string') {
      return { error: 'City must be a string or null' };
    } else {
      payload.city = body.city.trim();
    }
  }

  if (mode === 'update' && Object.keys(payload).length === 0) {
    return { error: 'At least one field (name, year, city) is required' };
  }

  return { payload };
};

// Validate that the provided id is a Mongo ObjectId and return a typed value.
const parseObjectId = (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return new mongoose.Types.ObjectId(id);
};

// Try to remove the photo file from PHOTOS_DIR using the stored filename.
const removePhotoFileIfRequested = async (req, photoName) => {
  const shouldDeleteFile = String(req.query?.deleteFile || '').toLowerCase() === 'true';
  if (!shouldDeleteFile || !photoName) {
    return { requested: shouldDeleteFile, deleted: false };
  }

  const photosDir = process.env.PHOTOS_DIR;
  if (!photosDir) {
    return { requested: true, deleted: false, warning: 'PHOTOS_DIR is not configured' };
  }

  const filePath = path.resolve(photosDir, photoName);
  const relative = path.relative(path.resolve(photosDir), filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { requested: true, deleted: false, warning: 'Invalid photo path' };
  }

  try {
    await fs.promises.unlink(filePath);
    return { requested: true, deleted: true };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { requested: true, deleted: false, warning: 'Photo file does not exist' };
    }
    console.error('[admin-photos] delete file failed', err);
    return { requested: true, deleted: false, warning: 'Failed to delete photo file' };
  }
};

// Return a paginated admin list of photos with sorting support.
adminPhotosCtrl.listPhotos = async (req, res) => {
  try {
    const Photo = getPhotoModel();
    const { page, limit, skip } = parsePaginationQuery(req.query);
    const sort = parseSortQuery(req.query);

    const [items, total] = await Promise.all([
      Photo.find({}, { name: 1, year: 1, city: 1 }).sort(sort).skip(skip).limit(limit).lean(),
      Photo.countDocuments({}),
    ]);

    return res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[admin-photos] listPhotos failed', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

// Return one photo record by id for admin edit workflows.
adminPhotosCtrl.getPhotoById = async (req, res) => {
  try {
    const photoId = parseObjectId(req.params.id);
    if (!photoId) {
      return res.status(400).json({ error: 'Invalid photo id' });
    }

    const Photo = getPhotoModel();
    const photo = await Photo.findById(photoId, { name: 1, year: 1, city: 1 }).lean();
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    return res.json(photo);
  } catch (err) {
    console.error('[admin-photos] getPhotoById failed', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

// Create a new photo metadata record for admin management.
adminPhotosCtrl.createPhoto = async (req, res) => {
  try {
    const { payload, error } = parsePhotoPayload(req.body, 'create');
    if (error) {
      return res.status(400).json({ error });
    }

    const Photo = getPhotoModel();
    const created = await Photo.create(payload);
    return res.status(201).json({
      _id: created._id,
      name: created.name,
      year: created.year,
      city: created.city,
    });
  } catch (err) {
    console.error('[admin-photos] createPhoto failed', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

// Update an existing photo metadata record fields for admin edits.
adminPhotosCtrl.updatePhoto = async (req, res) => {
  try {
    const photoId = parseObjectId(req.params.id);
    if (!photoId) {
      return res.status(400).json({ error: 'Invalid photo id' });
    }

    const { payload, error } = parsePhotoPayload(req.body, 'update');
    if (error) {
      return res.status(400).json({ error });
    }

    const Photo = getPhotoModel();
    const updated = await Photo.findByIdAndUpdate(photoId, payload, {
      new: true,
      runValidators: true,
      projection: { name: 1, year: 1, city: 1 },
    }).lean();

    if (!updated) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    return res.json(updated);
  } catch (err) {
    console.error('[admin-photos] updatePhoto failed', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

// Delete a photo metadata record and optionally remove its file from disk.
adminPhotosCtrl.deletePhoto = async (req, res) => {
  try {
    const photoId = parseObjectId(req.params.id);
    if (!photoId) {
      return res.status(400).json({ error: 'Invalid photo id' });
    }

    const Photo = getPhotoModel();
    const deleted = await Photo.findByIdAndDelete(photoId, { projection: { name: 1 } }).lean();
    if (!deleted) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const file = await removePhotoFileIfRequested(req, deleted.name);
    return res.json({ deleted: true, file });
  } catch (err) {
    console.error('[admin-photos] deletePhoto failed', err);
    return res.status(500).json({ error: 'Database error' });
  }
};

module.exports = adminPhotosCtrl;
