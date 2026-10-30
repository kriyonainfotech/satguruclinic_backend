const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const auth = require('../middleware/authMiddleware');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });
// Pharmacy bill ke payment wala expense yahan se nahi badalta, warna bill aur Finance alag ho jayenge
const pharmacyLocked = async (id, res) => {
    const exp = await Expense.findById(id).select('pharmacyBill');
    if (exp && exp.pharmacyBill) {
        res.status(400).json({ message: 'This expense is a Pharmacy Bill payment. Please edit or remove it from Pharmacy Bills.' });
        return true;
    }
    return false;
};

router.get('/', auth, async (req, res) => {
    try {
        const expenses = await Expense.find().sort({ createdAt: -1 });
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payments:expense-add'))) return denied(res);
        const { pharmacyBill, ...body } = req.body;
        const newExpense = new Expense(body);
        const savedExpense = await newExpense.save();
        res.status(201).json(savedExpense);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/:id', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payments:expense-edit'))) return denied(res);
        if (await pharmacyLocked(req.params.id, res)) return;
        const { pharmacyBill, ...body } = req.body;
        const updatedExpense = await Expense.findByIdAndUpdate(req.params.id, body, { new: true });
        res.json(updatedExpense);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payments:expense-edit'))) return denied(res);
        if (await pharmacyLocked(req.params.id, res)) return;
        await Expense.findByIdAndDelete(req.params.id);
        res.json({ message: 'Expense deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
