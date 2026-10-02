const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema({
    date: { type: String },
    party: { type: String, required: true },
    amount: { type: Number, required: true },
    category: { type: String, default: 'Sale' },
    account: { type: String, required: true },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }
}, { timestamps: true });

module.exports = mongoose.model('Collection', collectionSchema);
