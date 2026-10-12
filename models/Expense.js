const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    date: { type: String, required: true },
    party: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: 'Operational' },
    account: { type: String, required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    month: { type: String },
    year: { type: String },
    notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
