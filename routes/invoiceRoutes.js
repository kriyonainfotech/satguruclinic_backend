const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
const Collection = require('../models/Collection');
const auth = require('../middleware/authMiddleware');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

router.get('/', auth, async (req, res) => {
    try {
        const invoices = await Invoice.find().sort({ createdAt: -1 });
        res.json(invoices);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', auth, async (req, res) => {
    try {
        const newInvoice = new Invoice({
            ...req.body,
            createdBy: req.user.userId,
            createdByName: req.user.name,
            commissionAdded: false,
            commissionAmount: 0
        });
        const savedInvoice = await newInvoice.save();
        res.status(201).json(savedInvoice);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/:id', auth, async (req, res) => {
    try {
        // Commission fields are only changed via the payroll commission endpoint
        const { createdBy, createdByName, commissionAdded, commissionAmount, commissionAddedAt, ...updates } = req.body;
        const updatedInvoice = await Invoice.findByIdAndUpdate(req.params.id, updates, { new: true });
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
