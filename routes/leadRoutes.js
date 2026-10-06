const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, leadController.createLead);
router.get('/', authMiddleware, leadController.getLeads);
router.get('/reminders/today', authMiddleware, leadController.getTodayReminders);

router.get('/:id', authMiddleware, leadController.getLeadById);
router.put('/:id', authMiddleware, leadController.updateLead);
router.delete('/:id', authMiddleware, leadController.deleteLead);

router.post('/:id/reminders', authMiddleware, leadController.addReminder);
router.get('/:id/reminders', authMiddleware, leadController.getLeadReminders);
router.put('/reminders/:reminderId', authMiddleware, leadController.updateReminder);
router.delete('/reminders/:reminderId', authMiddleware, leadController.deleteReminder);

module.exports = router;
