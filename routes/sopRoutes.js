const express = require('express');
const router = express.Router();
const sopController = require('../controllers/sopController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// SOP CRUD
router.get('/', sopController.getSOPs);
router.post('/', sopController.createSOP);
router.put('/:id', sopController.updateSOP);
router.delete('/:id', sopController.deleteSOP);

// Points CRUD
router.post('/:id/points', sopController.addPoint);
router.put('/:id/points/:pointId', sopController.updatePoint);
router.delete('/:id/points/:pointId', sopController.deletePoint);

module.exports = router;
