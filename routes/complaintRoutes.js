const express = require('express');
const router = express.Router();
const Complaint = require('../models/Complaint');
const authMiddleware = require('../middleware/authMiddleware');
const { getUserPermissions, checkPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'You do not have permission to do this' });
const CATEGORIES = ['patient', 'team', 'error'];
const STATUSES = ['open', 'in-progress', 'resolved'];

router.use(authMiddleware);

// Complaints list: 'view-all' ho to sabki, warna sirf apni
router.get('/', async (req, res) => {
    try {
        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, 'complaints')) return denied(res);

        const query = checkPermission(permissions, 'complaints:view-all') ? {} : { createdBy: req.user.userId };
        const complaints = await Complaint.find(query)
            .populate('createdBy', 'name role category')
            .sort({ createdAt: -1 });
        res.json(complaints);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Nayi complaint
router.post('/', async (req, res) => {
    try {
        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, 'complaints:create')) return denied(res);

        const { category } = req.body;
        const description = (req.body.description || '').trim();
        if (!CATEGORIES.includes(category)) return res.status(400).json({ message: 'Please select a category' });
        if (!description) return res.status(400).json({ message: 'Please write the complaint details' });

        const complaint = await Complaint.create({ category, description, createdBy: req.user.userId });
        await complaint.populate('createdBy', 'name role category');
        res.status(201).json(complaint);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Complaint edit (category / details). Dusre ki complaint edit karne ke liye 'view-all' bhi chahiye
router.put('/:id', async (req, res) => {
    try {
        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, 'complaints:edit')) return denied(res);

        const complaint = await Complaint.findById(req.params.id);
        if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
        const isOwn = complaint.createdBy.toString() === req.user.userId.toString();
        if (!isOwn && !checkPermission(permissions, 'complaints:view-all')) return denied(res);

        const { category } = req.body;
        const description = (req.body.description || '').trim();
        if (!CATEGORIES.includes(category)) return res.status(400).json({ message: 'Please select a category' });
        if (!description) return res.status(400).json({ message: 'Please write the complaint details' });

        complaint.category = category;
        complaint.description = description;
        await complaint.save();
        await complaint.populate('createdBy', 'name role category');
        res.json(complaint);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Status badalna (Open / In Progress / Resolved)
router.patch('/:id/status', async (req, res) => {
    try {
        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, 'complaints:status')) return denied(res);

        const { status } = req.body;
        if (!STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });

        const complaint = await Complaint.findByIdAndUpdate(
            req.params.id,
            { status },
            { returnDocument: 'after' }
        ).populate('createdBy', 'name role category');
        if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
        res.json(complaint);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, 'complaints:delete')) return denied(res);

        const complaint = await Complaint.findByIdAndDelete(req.params.id);
        if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
        res.json({ message: 'Complaint deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
