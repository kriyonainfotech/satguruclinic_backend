const express = require('express');
const router = express.Router();
const ruleController = require('../controllers/ruleController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Rule CRUD
router.get('/', ruleController.getRules);
router.post('/', ruleController.createRule);
router.put('/:id', ruleController.updateRule);
router.delete('/:id', ruleController.deleteRule);

// Points CRUD
router.post('/:id/points', ruleController.addPoint);
router.put('/:id/points/:pointId', ruleController.updatePoint);
router.delete('/:id/points/:pointId', ruleController.deletePoint);

module.exports = router;
