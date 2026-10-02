const express = require('express');
const router = express.Router();
const CallLog = require('../models/CallLog');
const Patient = require('../models/Patient');
const authMiddleware = require('../middleware/authMiddleware');

// Create a call log
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { patientId, date, status, discussion, remarks } = req.body;
    const callLog = new CallLog({
      patient: patientId,
      teamMember: req.user.userId,
      date,
      status,
      discussion,
      remarks
    });
    await callLog.save();
    res.status(201).json(callLog);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Get call logs
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { month, year } = req.query;
    let query = {};
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      query.date = { $gte: startDate, $lte: endDate };
    }
    // If team member, only show their logs
    if (req.user.role === 'team' || req.query.view === 'my') {
      query.teamMember = req.user.userId;
    }
    const logs = await CallLog.find(query).populate('patient', 'fullName mobileNumber patientId').populate('teamMember', 'name role').sort({ date: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
});

// Update a log
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { patientId, date, status, discussion, remarks } = req.body;
    const log = await CallLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: 'Not found' });
    
    // Only the creator or admin can edit
    if (log.teamMember.toString() !== req.user.userId && req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    log.patient = patientId;
    log.date = date;
    log.status = status;
    log.discussion = discussion;
    log.remarks = remarks;

    await log.save();
    res.json(log);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server Error' });
  }
});

// Delete a log
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const log = await CallLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: 'Not found' });
    if (log.teamMember.toString() !== req.user.userId && req.user.role !== 'superadmin' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await CallLog.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server Error' });
  }
});
module.exports = router;

