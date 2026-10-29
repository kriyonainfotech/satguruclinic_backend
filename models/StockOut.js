const mongoose = require('mongoose');

// Sale Entry ke bina stock se nikali medicine (manually bechi, free di, staff use, kharab / expire...).
// Medicine Stock me ye "sold / out" me gini jaati hai.
const stockOutItemSchema = new mongoose.Schema({
    medicine: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', default: null },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: '', trim: true },
    qty: { type: Number, required: true, min: 1 }
}, { _id: false });

const stockOutSchema = new mongoose.Schema({
    date: { type: String, required: true }, // YYYY-MM-DD
    items: { type: [stockOutItemSchema], default: [] },
    reason: { type: String, required: true, trim: true },
    person: { type: String, default: '', trim: true }, // kisko di / kisko bechi
    note: { type: String, default: '', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('StockOut', stockOutSchema);
