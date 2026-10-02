const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    date: { type: String, required: true },
    party: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: 'Operational' },
    account: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
