const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');
const authMiddleware = require('../middleware/authMiddleware'); // assuming it exists

router.get('/auth/google', authMiddleware, calendarController.getAuthUrl);
router.get('/auth/google/callback', calendarController.oauthCallback);
router.get('/sync-status', authMiddleware, calendarController.checkSyncStatus);
router.get('/events', authMiddleware, calendarController.getEvents);
router.post('/events', authMiddleware, calendarController.createEvent);
router.put('/events/:eventId', authMiddleware, calendarController.updateEvent);
router.delete('/events/:eventId', authMiddleware, calendarController.deleteEvent);

router.post('/disconnect', require('../middleware/authMiddleware'), calendarController.disconnect);
module.exports = router;
