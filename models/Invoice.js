const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    client: { type: String, required: true },
    mobile: { type: String },
    work: { type: String },
    total: { type: Number, required: true },
    balance: { type: Number, required: true },
    loss: { type: Number, default: 0 },
    status: { type: String, default: 'Pending' },
    date: { type: String },
    notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
