const Photo = require('../models/photo');

const photoCtrl = {}

photoCtrl.getPrueba = (req, res) => {
    res.json({
        status: 'Photos goes here'
    });
}

photoCtrl.getCityPhoto = async (req, res) => {
    const photo = await Photo.aggregate([{ $match: { city: { $exists: true } } }, { $sample: { size: 1 } }]);
    res.json(photo[0]);  
}

photoCtrl.getYearPhoto = async (req, res) => {
    const photo = await Photo.aggregate([{ $match: { year: { $exists: true } } }, { $sample: { size: 1 } }]);
    res.json(photo[0]);  
}

module.exports = photoCtrl;