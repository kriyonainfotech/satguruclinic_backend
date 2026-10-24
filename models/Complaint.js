const mongoose = require('mongoose');

// Complaint Box: patient / team complaint ya koi error report
const complaintSchema = new mongoose.Schema({
    category: {
        type: String,
        enum: ['patient', 'team', 'error'],
        required: [true, 'Category is required']
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true
    },
    status: {
        type: String,
        enum: ['open', 'in-progress', 'resolved'],
        default: 'open'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Complaint', complaintSchema);
