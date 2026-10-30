const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Collection = require('../models/Collection');
const auth = require('../middleware/authMiddleware');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });
const ACCOUNTS = ['Cash', 'Company Bank', 'Personal Bank'];
const round2 = (n) => Math.round(n * 100) / 100;

// Sale me bechi medicines: [{ medicine, name, qty }]. Custom (list ke bahar) medicine ka id null.
const cleanMedicineItems = (list) => {
    if (!Array.isArray(list)) return undefined;
    return list
        .map(m => ({
            medicine: m && mongoose.Types.ObjectId.isValid(m.medicine) ? m.medicine : null,
            name: String(m?.name || '').trim(),
            qty: Math.max(1, Math.round(Number(m?.qty) || 1))
        }))
        .filter(m => m.name);
};

router.get('/', auth, async (req, res) => {
    try {
        const invoices = await Invoice.find().sort({ createdAt: -1 });
        res.json(invoices);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Sale entry ke waqt hi paisa mil gaya ho to body.receivedAmount + body.receivedAccount:
// invoice ka balance kam hota hai aur us account me Collection ban jata hai
router.post('/', auth, async (req, res) => {
    try {
        const { receivedAmount, receivedAccount, ...body } = req.body;
        const received = round2(Number(receivedAmount) || 0);
        if (received < 0) return res.status(400).json({ message: 'Please enter a valid received amount' });
        if (received > 0) {
            if (!(await hasPermission(req.user, 'payments:collect'))) return denied(res);
            if (!ACCOUNTS.includes(receivedAccount)) return res.status(400).json({ message: 'Please select the account the payment was received in' });
            if (received > Number(body.total)) return res.status(400).json({ message: 'Received amount cannot be more than the total' });
            body.balance = round2(Number(body.total) - received);
            body.status = body.balance <= 0 ? 'Cleared' : 'Pending';
        }
        const newInvoice = new Invoice({
            ...body,
            medicineItems: cleanMedicineItems(body.medicineItems),
            createdBy: req.user.userId,
            createdByName: req.user.name,
            commissionAdded: false,
            commissionAmount: 0
        });
        const savedInvoice = await newInvoice.save();
        let collection = null;
        if (received > 0) {
            try {
                collection = await Collection.create({
                    date: savedInvoice.date,
                    party: savedInvoice.client,
                    amount: received,
                    category: 'Sale',
                    account: receivedAccount,
                    invoiceId: savedInvoice._id
                });
            } catch (err) {
                await savedInvoice.deleteOne();
                throw err;
            }
        }
        res.status(201).json({ ...savedInvoice.toObject(), collection });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/:id', auth, async (req, res) => {
    try {
        // Commission fields are only changed via the payroll commission endpoint
        const { createdBy, createdByName, commissionAdded, commissionAmount, commissionAddedAt, ...updates } = req.body;
        // Work badla par medicineItems nahi aaye to purane items hata do, stock tracking 'work' text se padhega
        if (updates.medicineItems !== undefined) updates.medicineItems = cleanMedicineItems(updates.medicineItems);
        const update = { $set: updates };
        if (updates.work !== undefined && updates.medicineItems === undefined) {
            delete updates.medicineItems;
            update.$unset = { medicineItems: 1 };
        }
        const updatedInvoice = await Invoice.findByIdAndUpdate(req.params.id, update, { new: true });
        res.json(updatedInvoice);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payments:invoice-delete'))) return denied(res);
        await Invoice.findByIdAndDelete(req.params.id);
        await Collection.deleteMany({ invoiceId: req.params.id });
        res.json({ message: 'Invoice and associated collections deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
