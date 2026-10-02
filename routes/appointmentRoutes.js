const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.get('/', appointmentController.getAppointments);
router.post('/', appointmentController.createAppointment);
router.put('/:id/status', appointmentController.updateAppointmentStatus);
router.delete('/:id', appointmentController.deleteAppointment);
router.put('/:id', appointmentController.updateAppointment);

module.exports = router;
