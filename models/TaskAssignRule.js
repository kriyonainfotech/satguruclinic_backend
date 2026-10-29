const mongoose = require('mongoose');

// Poori clinic ke liye ek hi document: kaun (Admin / Senior / Junior) kisko task assign kar sakta hai.
// matrix = { admin: { admin, senior, junior }, senior: {...}, junior: {...} } (Boolean)
// Document na ho to config/taskAssign.js ke defaults chalte hain.
const taskAssignRuleSchema = new mongoose.Schema({
    matrix: {
        type: Object,
        default: {}
    }
}, { timestamps: true, minimize: false });

module.exports = mongoose.model('TaskAssignRule', taskAssignRuleSchema);
