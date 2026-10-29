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
    // Bechi gayi medicines (stock tracking). Purane invoices me nahi hai, wahan 'work' text se padhte hain.
    medicineItems: {
        type: [{
            _id: false,
            medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
            name: { type: String, required: true },
            qty: { type: Number, required: true, min: 1 }
        }],
        default: undefined
    },
    // Sales commission: the team member who made the sale gets a % of the sale total
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    commissionAdded: { type: Boolean, default: false },
    commissionAmount: { type: Number, default: 0 },
    commissionAddedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
