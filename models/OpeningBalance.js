const mongoose = require('mongoose');

// Payments & Finances ke 3 accounts ka opening balance (sirf ek hi record rehta hai).
// date = kis din se ye balance hai (YYYY-MM-DD)
const openingBalanceSchema = new mongoose.Schema({
    cash: { type: Number, default: 0 },
    personal: { type: Number, default: 0 }, // Personal Bank
    company: { type: Number, default: 0 },  // Company Bank
    date: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('OpeningBalance', openingBalanceSchema);
