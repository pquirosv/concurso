const mongoose = require('mongoose');

// Validate and normalize admin photo payload and id inputs.
class PhotoValidator {
  // Validate and normalize create/update payload fields for photo metadata.
  validatePayload(body, mode = 'create') {
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
  }

  // Validate that the provided id is a Mongo ObjectId and return a typed value.
  parseObjectId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return new mongoose.Types.ObjectId(id);
  }
}

module.exports = { PhotoValidator };
