const express = require('express');
const router = express.Router();
const packageController = require('../controllers/packageController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, packageController.createPackage);
router.get('/', authMiddleware, packageController.getPackages);
router.put('/:id', authMiddleware, packageController.updatePackage);
router.delete('/:id', authMiddleware, packageController.deletePackage);

module.exports = router;
