const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: String, // Format: YYYY-MM-DD
        required: true
    },
    shifts: [{
        shiftIndex: { type: Number, default: 0 },
        clockIn: { type: Date },
        clockOut: { type: Date }
    }],
    clockIn: {
        type: Date
    },
    clockOut: {
        type: Date
    },
    status: {
        type: String,
        enum: ['present', 'half-day', 'short-time', 'leave', 'holiday', 'unpaid-holiday'],
        default: 'present'
    },
    isManualOverride: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// A user can only have one attendance record per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
