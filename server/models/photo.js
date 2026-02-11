const mongoose = require('mongoose');
const { Schema } = mongoose;

const PhotoSchema = new Schema({
    name: {type: String, required: true},
    year: {type: Number, required: false},
    city: {type: String, required: false}
});

// Query patterns:
// - random year question: $match on year existence
// - random city question and cities list: $match/distinct on city existence
// - optional mixed filters in future: city + year
PhotoSchema.index(
  { year: 1 },
  {
    name: 'idx_photos_year_exists',
    partialFilterExpression: { year: { $exists: true } },
  }
);
PhotoSchema.index(
  { city: 1 },
  {
    name: 'idx_photos_city_exists',
    partialFilterExpression: { city: { $exists: true } },
  }
);
PhotoSchema.index(
  { city: 1, year: 1 },
  {
    name: 'idx_photos_city_year_exists',
    partialFilterExpression: {
      city: { $exists: true },
      year: { $exists: true },
    },
  }
);

const getPhotoModel = () => {
  const collection = process.env.PHOTOS_COLLECTION || 'photos';
  const modelName = `Photo_${collection}`;
  return mongoose.models[modelName] || mongoose.model(modelName, PhotoSchema, collection);
};

module.exports = { getPhotoModel };
