const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Task title is required'],
        trim: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    category: {
        type: String,
        default: 'General',
        trim: true
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Assigned user is required']
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Assigner user is required']
    },
    dueDate: {
        type: Date,
        required: [true, 'Due date is required']
    },
    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Completed', 'Overdue', 'Done'],
        default: 'Pending'
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    }
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
