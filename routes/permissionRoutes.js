const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permissionController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/me', permissionController.getMyPermissions);
router.get('/', permissionController.getAllPermissions);
router.put('/', permissionController.updatePermissions);
router.post('/reset', permissionController.resetPermissions);
router.get('/task-assign', permissionController.getTaskAssignMatrix);
router.put('/task-assign', permissionController.updateTaskAssignMatrix);

module.exports = router;
