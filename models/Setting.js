const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    clinicContactNumber: {
        type: String,
        default: ''
    },
    birthdayMessageTemplate: {
        type: String,
        default: 'Dear {Name}, wishing you a very Happy Birthday from Satguru Clinic! Have a wonderful and healthy year ahead. For appointments, call us at {ClinicNumber}.'
    },
    adminCategories: {
        type: [String],
        default: ['Receptionist', 'Manager']
    },
    teamCategories: {
        type: [String],
        default: ['Doctor', 'Nurse', 'Staff']
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    consultationFee: {
        type: Number,
        default: 500
    }
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);