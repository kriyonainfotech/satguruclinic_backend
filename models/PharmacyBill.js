const mongoose = require('mongoose');

// Pharmacy / supplier se aaya saman ka bill, aur us bill ke against kiye gaye payments
const paymentSchema = new mongoose.Schema({
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: String, required: true }, // YYYY-MM-DD
    note: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const pharmacyBillSchema = new mongoose.Schema({
    supplierName: {
        type: String,
        required: [true, 'Supplier / pharma name is required'],
        trim: true
    },
    billNumber: { type: String, default: '', trim: true },
    billDate: { type: String, required: [true, 'Bill date is required'] }, // YYYY-MM-DD
    dueDate: { type: String, default: '' }, // YYYY-MM-DD, optional
    items: { type: String, default: '', trim: true }, // kya saman aaya
    totalAmount: {
        type: Number,
        required: [true, 'Bill amount is required'],
        min: [0, 'Bill amount cannot be negative']
    },
    payments: { type: [paymentSchema], default: [] },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

const round2 = (n) => Math.round(n * 100) / 100;

pharmacyBillSchema.virtual('paidAmount').get(function () {
    return round2((this.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0));
});

pharmacyBillSchema.virtual('pendingAmount').get(function () {
    return Math.max(0, round2((this.totalAmount || 0) - this.paidAmount));
});

// paid = poora payment, partial = kuch diya, pending = kuch nahi diya
pharmacyBillSchema.virtual('paymentStatus').get(function () {
    if (this.pendingAmount <= 0) return 'paid';
    return this.paidAmount > 0 ? 'partial' : 'pending';
});

module.exports = mongoose.model('PharmacyBill', pharmacyBillSchema);
