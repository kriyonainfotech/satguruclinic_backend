const mongoose = require('mongoose');

const rulePointSchema = new mongoose.Schema({
    heading: { type: String, required: true },
    description: { type: String }
});

const ruleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    assignedRoles: [{ type: String }],
    assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    points: [rulePointSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Rule', ruleSchema);
