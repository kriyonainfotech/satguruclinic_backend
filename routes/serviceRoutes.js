const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, serviceController.createService);
router.get('/', authMiddleware, serviceController.getServices);
router.put('/:id', authMiddleware, serviceController.updateService);
router.delete('/:id', authMiddleware, serviceController.deleteService);

module.exports = router;
