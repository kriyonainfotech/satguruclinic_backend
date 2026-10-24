const express = require('express');
const router = express.Router();
const OpeningBalance = require('../models/OpeningBalance');
const authMiddleware = require('../middleware/authMiddleware');
const { getUserPermissions, checkPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'You do not have permission to do this' });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round(n * 100) / 100;

router.use(authMiddleware);

const toJson = (doc) => ({
    cash: doc?.cash || 0,
    personal: doc?.personal || 0,
    company: doc?.company || 0,
    date: doc?.date || '',
    updatedAt: doc?.updatedAt || null
});

router.get('/', async (req, res) => {
    try {
        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, 'payments')) return denied(res);
        const doc = await OpeningBalance.findOne();
        res.json(toJson(doc));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.put('/', async (req, res) => {
    try {
        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, 'payments:opening-balance')) return denied(res);

        const values = {};
        for (const key of ['cash', 'personal', 'company']) {
            const n = Number(req.body[key] ?? 0);
            if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: `Please enter a valid ${key} amount` });
            values[key] = round2(n);
        }
        if (!DATE_RE.test(req.body.date || '')) return res.status(400).json({ message: 'Please select the opening balance date' });

        const doc = await OpeningBalance.findOneAndUpdate(
            {},
            { $set: { ...values, date: req.body.date, updatedBy: req.user.userId } },
            { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
        );
        res.json(toJson(doc));
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;
