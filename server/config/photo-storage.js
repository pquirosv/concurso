const fs = require('fs');
const path = require('path');

// Validate required photo storage environment and directory permissions before app startup.
const validatePhotoStorageEnv = () => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const photosDir = process.env.PHOTOS_DIR;
  if (!photosDir) {
    throw new Error('Missing required environment variable: PHOTOS_DIR');
  }

  const resolvedPath = path.resolve(photosDir);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`PHOTOS_DIR does not exist: ${resolvedPath}`);
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error(`PHOTOS_DIR is not a directory: ${resolvedPath}`);
  }

  fs.accessSync(resolvedPath, fs.constants.W_OK);
};

module.exports = {
  validatePhotoStorageEnv,
};
