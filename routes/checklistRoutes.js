const express = require('express');
const router = express.Router();
const ChecklistTemplate = require('../models/ChecklistTemplate');
const authMiddleware = require('../middleware/authMiddleware');

// Get all templates for the logged in user's organization
router.get('/', authMiddleware, async (req, res) => {
  try {
    const templates = await ChecklistTemplate.find().sort({ createdAt: -1 });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new template
router.post('/', authMiddleware, async (req, res) => {
  try {
    const adminId = req.user.role === 'team' || req.user.role === 'admin' ? req.user.adminId || req.user.userId : req.user.userId;
    const newTemplate = new ChecklistTemplate({
      title: req.body.title,
      items: req.body.items,
      adminId,
      createdBy: req.user.userId
    });
    const savedTemplate = await newTemplate.save();
    res.status(201).json(savedTemplate);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update template
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const updatedTemplate = await ChecklistTemplate.findByIdAndUpdate(
      req.params.id,
      {
        title: req.body.title,
        items: req.body.items
      },
      { new: true }
    );
    res.json(updatedTemplate);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete template
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await ChecklistTemplate.findByIdAndDelete(req.params.id);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;


