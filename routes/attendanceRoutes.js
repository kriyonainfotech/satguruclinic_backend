const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const authMiddleware = require('../middleware/authMiddleware');

// General endpoints
router.get('/today', authMiddleware, attendanceController.getTodayStatus);
router.post('/clock-in', authMiddleware, attendanceController.clockIn);
router.post('/clock-out', authMiddleware, attendanceController.clockOut);

// Admin / Superadmin endpoints
router.get('/', authMiddleware, attendanceController.getAttendanceList);
router.put('/status', authMiddleware, attendanceController.updateAttendanceStatus);

module.exports = router;
