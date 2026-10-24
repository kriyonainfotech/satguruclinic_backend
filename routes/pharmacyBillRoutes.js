const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const PharmacyBill = require('../models/PharmacyBill');
const authMiddleware = require('../middleware/authMiddleware');
const { getUserPermissions, checkPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'You do not have permission to do this' });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round(n * 100) / 100;

router.use(authMiddleware);

// Har route pe module + action permission check
const requirePermission = (key) => async (req, res, next) => {
    try {
        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, key)) return denied(res);
        next();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

const findBill = async (id, res) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(404).json({ message: 'Bill not found' });
        return null;
    }
    const bill = await PharmacyBill.findById(id);
    if (!bill) res.status(404).json({ message: 'Bill not found' });
    return bill;
};

// Bill ki details body se validate karke nikalna (create + edit dono me)
const readBillFields = (body) => {
    const supplierName = (body.supplierName || '').trim();
    const totalAmount = Number(body.totalAmount);
    if (!supplierName) return { error: 'Please enter the supplier / pharma name' };
    if (!DATE_RE.test(body.billDate || '')) return { error: 'Please select the bill date' };
    if (body.dueDate && !DATE_RE.test(body.dueDate)) return { error: 'Invalid due date' };
    if (!Number.isFinite(totalAmount) || totalAmount < 0) return { error: 'Please enter a valid bill amount' };
    return {
        fields: {
            supplierName,
            billNumber: (body.billNumber || '').trim(),
            billDate: body.billDate,
            dueDate: body.dueDate || '',
            items: (body.items || '').trim(),
            totalAmount: round2(totalAmount),
            notes: (body.notes || '').trim()
        }
    };
};

const readPayment = (body, pending, userId) => {
    const amount = round2(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) return { error: 'Please enter a valid payment amount' };
    if (amount > pending) return { error: `Payment cannot be more than the pending amount (${pending})` };
    if (!DATE_RE.test(body.date || '')) return { error: 'Please select the payment date' };
    return {
        payment: {
            amount,
            date: body.date,
            note: (body.note || '').trim(),
            createdBy: userId
        }
    };
};

router.get('/', requirePermission('pharmacy-bills'), async (req, res) => {
    try {
        const bills = await PharmacyBill.find()
            .populate('createdBy', 'name')
            .sort({ billDate: -1, createdAt: -1 });
        res.json(bills);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Naya bill. Bill ke saath hi kuch payment kar diya ho to body.paidAmount
router.post('/', requirePermission('pharmacy-bills:create'), async (req, res) => {
    try {
        const { fields, error } = readBillFields(req.body);
        if (error) return res.status(400).json({ message: error });

        const bill = new PharmacyBill({ ...fields, createdBy: req.user.userId });
        if (Number(req.body.paidAmount) > 0) {
            const { payment, error: payError } = readPayment({
                amount: req.body.paidAmount,
                date: req.body.paymentDate || fields.billDate,
                note: 'Paid at bill entry'
            }, fields.totalAmount, req.user.userId);
            if (payError) return res.status(400).json({ message: payError });
            bill.payments.push(payment);
        }
        await bill.save();
        await bill.populate('createdBy', 'name');
        res.status(201).json(bill);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.put('/:id', requirePermission('pharmacy-bills:edit'), async (req, res) => {
    try {
        const bill = await findBill(req.params.id, res);
        if (!bill) return;
        const { fields, error } = readBillFields(req.body);
        if (error) return res.status(400).json({ message: error });
        if (fields.totalAmount < bill.paidAmount) {
            return res.status(400).json({ message: `Bill amount cannot be less than the amount already paid (${bill.paidAmount})` });
        }
        Object.assign(bill, fields);
        await bill.save();
        await bill.populate('createdBy', 'name');
        res.json(bill);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.delete('/:id', requirePermission('pharmacy-bills:delete'), async (req, res) => {
    try {
        const bill = await findBill(req.params.id, res);
        if (!bill) return;
        await bill.deleteOne();
        res.json({ message: 'Bill deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Bill ke against payment add karna
router.post('/:id/payments', requirePermission('pharmacy-bills:payment'), async (req, res) => {
    try {
        const bill = await findBill(req.params.id, res);
        if (!bill) return;
        const { payment, error } = readPayment(req.body, bill.pendingAmount, req.user.userId);
        if (error) return res.status(400).json({ message: error });
        bill.payments.push(payment);
        await bill.save();
        await bill.populate('createdBy', 'name');
        res.status(201).json(bill);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Galat payment entry hatana
router.delete('/:id/payments/:paymentId', requirePermission('pharmacy-bills:payment'), async (req, res) => {
    try {
        const bill = await findBill(req.params.id, res);
        if (!bill) return;
        const payment = bill.payments.id(req.params.paymentId);
        if (!payment) return res.status(404).json({ message: 'Payment not found' });
        payment.deleteOne();
        await bill.save();
        await bill.populate('createdBy', 'name');
        res.json(bill);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
