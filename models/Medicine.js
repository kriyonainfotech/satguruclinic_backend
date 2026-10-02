const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    category: { type: String, default: 'Other' },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    defaultDosage: { type: String, trim: true, default: '' },
    description: {
        type: String,
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Medicine', MedicineSchema);
