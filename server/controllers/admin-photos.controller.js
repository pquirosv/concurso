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

// Return a paginated admin list of photos with sorting support.
adminPhotosCtrl.listPhotos = async (req, res) => {
  try {
    const result = await adminPhotosService.listPhotos(req.query);
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
    const result = await adminPhotosService.createPhoto(req.body);
    return res.status(201).json(result);
  } catch (error) {
    return sendErrorResponse(res, error, 'createPhoto');
  }
};

// Update an existing photo metadata record fields for admin edits.
adminPhotosCtrl.updatePhoto = async (req, res) => {
  try {
    const result = await adminPhotosService.updatePhoto(req.params.id, req.body);
    return res.json(result);
  } catch (error) {
    return sendErrorResponse(res, error, 'updatePhoto');
  }
};

// Delete a photo metadata record and optionally remove its file from disk.
adminPhotosCtrl.deletePhoto = async (req, res) => {
  try {
    const result = await adminPhotosService.deletePhoto(req.params.id, req.query);
    return res.json(result);
  } catch (error) {
    return sendErrorResponse(res, error, 'deletePhoto');
  }
};

module.exports = adminPhotosCtrl;
