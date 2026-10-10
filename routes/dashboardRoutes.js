const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middleware/authMiddleware');

router.get('/superadmin', authMiddleware, dashboardController.getSuperadminDashboard);

router.get('/team-performance', authMiddleware, dashboardController.getTeamMemberPerformance);

module.exports = router;
