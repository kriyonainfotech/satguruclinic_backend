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
    notes: { type: String },
    // Pharmacy Bills ke payment se apne aap bana expense (edit / delete wahi se hota hai)
    pharmacyBill: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmacyBill', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
