const express = require('express');
const router = express.Router();
const Collection = require('../models/Collection');
const auth = require('../middleware/authMiddleware');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

router.get('/', auth, async (req, res) => {
    try {
        const collections = await Collection.find().sort({ createdAt: -1 });
        res.json(collections);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payments:collect'))) return denied(res);
        const newCollection = new Collection(req.body);
        const savedCollection = await newCollection.save();
        res.status(201).json(savedCollection);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/:id', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payments:collection-edit'))) return denied(res);
        const updatedCollection = await Collection.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedCollection);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payments:collection-edit'))) return denied(res);
        await Collection.findByIdAndDelete(req.params.id);
        res.json({ message: 'Collection deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
