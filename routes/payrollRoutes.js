const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const auth = require('../middleware/authMiddleware');

router.get('/', auth, payrollController.getPayroll);
router.get('/my-wallet', auth, payrollController.getMyWallet);

module.exports = router;
