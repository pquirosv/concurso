const fs = require('fs');
const { formidable } = require('formidable');

const {
  AdminPhotosService,
  AdminPhotosServiceError,
} = require('../business/admin-photos/admin-photos.service');

const adminPhotosCtrl = {};
const adminPhotosService = new AdminPhotosService();

// Convert business errors to HTTP responses and mask unexpected failures.
const sendErrorResponse = (res, error, label) => {
  if (error instanceof AdminPhotosServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error(`[admin-photos] ${label} failed`, error);
  return res.status(500).json({ error: 'Database error' });
};

// Return the first value from a field array returned by multipart parsers.
const firstFieldValue = (value) => (Array.isArray(value) ? value[0] : value);

// Parse a multipart request and return normalized metadata fields and a file buffer.
const parsePhotoUploadRequest = async (req) => {
  const form = formidable({ multiples: false });
  const { fields, files } = await new Promise((resolve, reject) => {
    form.parse(req, (error, parsedFields, parsedFiles) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ fields: parsedFields, files: parsedFiles });
    });
  });
  const uploadedFile = files.photo;
  const fileValue = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;

  if (!fileValue) {
    throw new AdminPhotosServiceError('Photo file is required', 400);
  }

  const fileBuffer = await fs.promises.readFile(fileValue.filepath);
  return {
    body: {
      year: firstFieldValue(fields.year),
      city: firstFieldValue(fields.city),
    },
    file: {
      originalname: fileValue.originalFilename || 'upload',
      buffer: fileBuffer,
    },
  };
};

// Return the full admin list of photos for client-side pagination in the UI.
adminPhotosCtrl.listPhotos = async (req, res) => {
  try {
    const result = await adminPhotosService.listPhotos();
    return res.json(result);
  } catch (error) {
    return sendErrorResponse(res, error, 'listPhotos');
  }
};

// Return one photo record by id for admin edit workflows.
adminPhotosCtrl.getPhotoById = async (req, res) => {
  try {
    const result = await adminPhotosService.getPhotoById(req.params.id);
    return res.json(result);
  } catch (error) {
    return sendErrorResponse(res, error, 'getPhotoById');
  }
};

// Create a new photo metadata record for admin management.
adminPhotosCtrl.createPhoto = async (req, res) => {
  try {
    const { body, file } = await parsePhotoUploadRequest(req);
    const result = await adminPhotosService.createPhoto(body, file);
    return res.status(201).json(result);
  } catch (error) {
    return sendErrorResponse(res, error, 'createPhoto');
  }
};

// Update editable metadata fields (year/city) by Mongo _id for admin edits; name is immutable.
adminPhotosCtrl.updatePhoto = async (req, res) => {
  try {
    const result = await adminPhotosService.updatePhoto(req.params.id, req.body);
    return res.json(result);
  } catch (error) {
    return sendErrorResponse(res, error, 'updatePhoto');
  }
};

// Delete a photo metadata record and remove its file from disk when available.
adminPhotosCtrl.deletePhoto = async (req, res) => {
  try {
    const result = await adminPhotosService.deletePhoto(req.params.id);
    return res.json(result);
  } catch (error) {
    return sendErrorResponse(res, error, 'deletePhoto');
  }
};

module.exports = adminPhotosCtrl;
