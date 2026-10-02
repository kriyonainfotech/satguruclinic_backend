const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
    // Basic Details
    patientId: {
        type: String,
        required: true,
        unique: true
    },
    fullName: {
        type: String,
        required: true
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
        required: true
    },
    dateOfBirth: {
        type: Date,
        required: true
    },
    age: {
        type: Number,
        required: true
    },
    mobileNumber: {
        type: String,
        required: true
    },
    email: {
        type: String
    },
    address: {
        type: String
    },

    // Medical Details
    bloodGroup: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'],
        default: 'Unknown'
    },
    allergies: {
        type: String,
        default: ''
    },
    existingConditions: {
        type: String,
        default: ''
    },
    currentMedicines: {
        type: String,
        default: ''
    },
    previousHistory: {
        type: String,
        default: ''
    },

    // Emergency Details
    emergencyContactName: {
        type: String,
        default: ''
    },
    emergencyContactNumber: {
        type: String,
        default: ''
    },
    relationship: {
        type: String,
        default: ''
    },

    // Clinic Details
    assignedTeamMember: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Only team members can be assigned usually
    },
    registrationDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },

    // Data Ownership
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        // required: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true // The specific user (admin or team) who created this record
    }

}, { timestamps: true });

// Auto calculate age before validation if not provided, but usually we calculate it and save it.
// We can use a pre-validate hook just in case age is missing but DOB is present.
patientSchema.pre('validate', function() {
    if (this.dateOfBirth && !this.age) {
        const today = new Date();
        const birthDate = new Date(this.dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        this.age = age;
    }
});

module.exports = mongoose.model('Patient', patientSchema);
