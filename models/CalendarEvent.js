const mongoose = require('mongoose');

const CalendarEventSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    summary: {
        type: String,
        required: true
    },
    title: {
        type: String
    },
    description: {
        type: String,
        default: ''
    },
    type: {
        type: String,
        enum: ['Meeting', 'Task', 'Event'],
        default: 'Meeting'
    },
    startDateTime: {
        type: Date,
        required: true
    },
    endDateTime: {
        type: Date,
        required: true
    },
    googleEventId: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('CalendarEvent', CalendarEventSchema);
