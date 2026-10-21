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
    notes: { type: String },
    // Sales commission: the team member who made the sale gets a % of the sale total
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    commissionAdded: { type: Boolean, default: false },
    commissionAmount: { type: Number, default: 0 },
    commissionAddedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
