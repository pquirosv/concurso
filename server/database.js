const mongoose = require('mongoose');

// Allow overriding the URI to support Docker/local flexibility.
const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/concurso';

mongoose
  .connect(URI)
  .then(() => console.log(`DB is connected to ${URI}`))
  .catch(err => console.error(err));

module.exports = mongoose;
