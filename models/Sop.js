const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
    heading: { type: String, required: true },
    description: { type: String }
});

const sopSchema = new mongoose.Schema({
    title: { type: String, required: true },
    assignedRoles: [{ type: String }],
    assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    points: [pointSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('SOP', sopSchema);
