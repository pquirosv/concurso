const mongoose = require('mongoose');
const { Schema } = mongoose;

const PhotoSchema = new Schema({
    name: {type: String, required: true},
    city: {type: Number, required: false},
    year: {type: Number, required: false},
    yearOptions: {type: [String], required: false},
    cityOptions: {type: [String], required: false}
}, { collection: 'photos' }); // specify the name of the collection


module.exports = mongoose.model('Photo', PhotoSchema);