const mongoose = require('mongoose');

// Ye User schema hai jo database me save hoga.
// Isme humne 'role' add kiya hai taaki pata chale ki user superadmin hai, admin hai ya team member.
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true // Email unique honi chahiye
    },
    password: {
        type: String,
        required: true
    },
    mobile: {
        type: String,
        required: false
    },
    birthDate: {
        type: Date,
        required: false
    },
    role: {
        type: String,
        enum: ['superadmin', 'admin', 'team'],
        default: 'team'
    },
    
    category: {
        type: String,
        required: false,
        default: '' // Clinic categories like 'Doctor', 'Nurse', 'Receptionist' etc.
    },
    timingType: {
        type: String,
        enum: ['normal', 'shift'],
        default: 'normal'
    },
    timings: [{
        startTime: String,
        endTime: String
    }],
    salary: {
        type: Number,
        required: false,
        default: 0 // Monthly Salary
    },
    googleCalendarTokens: { type: Object, default: null },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false // Only required for Team members, points to their Admin
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
