const mongoose = require('mongoose');

const companyHolidaySchema = new mongoose.Schema({
    date: {
        type: String, // Format: YYYY-MM-DD
        required: true
    },
    title: {
        type: String,
        required: true
    },
    isOfficial: {
        type: Boolean,
        default: false
    },
    isPaid: {
        type: Boolean,
        default: false
    },
    isHalfDay: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('CompanyHoliday', companyHolidaySchema);
