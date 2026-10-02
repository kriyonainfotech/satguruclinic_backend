const express = require('express');
const router = express.Router();
const medicineController = require('../controllers/medicineController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/', authMiddleware, medicineController.createMedicine);
router.get('/', authMiddleware, medicineController.getMedicines);
router.put('/:id', authMiddleware, medicineController.updateMedicine);
router.delete('/:id', authMiddleware, medicineController.deleteMedicine);

module.exports = router;
