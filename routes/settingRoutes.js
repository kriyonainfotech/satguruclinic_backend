const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', settingController.getSettings);
router.put('/', settingController.updateSettings);

module.exports = router;