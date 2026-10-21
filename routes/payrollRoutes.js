const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');
const auth = require('../middleware/authMiddleware');

router.get('/', auth, payrollController.getPayroll);
router.get('/my-wallet', auth, payrollController.getMyWallet);
router.post('/disburse', auth, payrollController.disburseSalary);
router.post('/commission/:invoiceId', auth, payrollController.toggleSaleCommission);
router.post('/lead-bonus/:leadId', auth, payrollController.toggleLeadBonus);

module.exports = router;
