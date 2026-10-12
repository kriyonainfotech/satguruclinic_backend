const express = require('express');
const router = express.Router();
const dailyReportController = require('../controllers/dailyReportController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, dailyReportController.saveReport);
router.get('/single', authMiddleware, dailyReportController.getUserReport);
router.get('/', authMiddleware, dailyReportController.getAllReports);
router.delete('/:id', authMiddleware, dailyReportController.deleteReport);

module.exports = router;
