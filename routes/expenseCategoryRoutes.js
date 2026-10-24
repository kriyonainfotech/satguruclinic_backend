const express = require('express');
const router = express.Router();
const ExpenseCategory = require('../models/ExpenseCategory');
const auth = require('../middleware/authMiddleware');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

// Pehli baar list khali ho to purani fixed categories seed kar do
const DEFAULT_CATEGORIES = ['Operational', 'Salary / Payout', 'Purchase'];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', auth, async (req, res) => {
    try {
        let categories = await ExpenseCategory.find().sort({ createdAt: 1 });
        if (categories.length === 0) {
            await ExpenseCategory.insertMany(DEFAULT_CATEGORIES.map(name => ({ name })), { ordered: false }).catch(() => {});
            categories = await ExpenseCategory.find().sort({ createdAt: 1 });
        }
        res.json(categories);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payments:expense-add'))) return denied(res);
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ message: 'Category name required hai' });
        const exists = await ExpenseCategory.findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
        if (exists) return res.status(400).json({ message: 'Ye category pehle se exist karti hai' });
        const category = await ExpenseCategory.create({ name });
        res.status(201).json(category);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payments:expense-edit'))) return denied(res);
        await ExpenseCategory.findByIdAndDelete(req.params.id);
        res.json({ message: 'Category deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
