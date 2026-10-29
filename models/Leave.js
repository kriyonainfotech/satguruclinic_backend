const mongoose = require('mongoose');

// Staff ki leave request. Approve hone ke baad Holidays & Events calendar me dikhti hai.
// Superadmin ki leave seedha 'Approved' save hoti hai.
const leaveSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    leaveType: {
        type: String,
        enum: ['Casual', 'Sick', 'Emergency', 'Other'],
        default: 'Casual'
    },
    startDate: {
        type: String, // Format: YYYY-MM-DD
        required: true
    },
    endDate: {
        type: String, // Format: YYYY-MM-DD
        required: true
    },
    // Optional: kisi din ka time diya ho to us din sirf utne time ki leave, baaki din pure din ki
    dayTimes: [{
        _id: false,
        date: { type: String, required: true }, // Format: YYYY-MM-DD
        fromTime: { type: String, required: true }, // Format: "02:30 PM"
        toTime: { type: String, required: true }
    }],
    // Purane records: ek hi time saare dino pe (naye records dayTimes use karte hain)
    fromTime: {
        type: String,
        default: ''
    },
    toTime: {
        type: String,
        default: ''
    },
    reason: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    actionBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    actionAt: {
        type: Date,
        default: null
    },
    actionNote: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('Leave', leaveSchema);
