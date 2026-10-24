const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Patient = require('../models/Patient');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

// PUT /:id teen jagah se aata hai, body dekh ke batata hai kaunsi permission chahiye:
// Sale Entry ke baad { hasSaleEntry, status } -> sale-entry, Reschedule { appointmentDate, timeSlot, status: 'Rescheduled' } -> status, baaki -> edit
const updateActionFor = (body) => {
    const keys = Object.keys(body || {});
    if ('hasSaleEntry' in body && keys.every(k => ['hasSaleEntry', 'status'].includes(k))) return 'sale-entry';
    if (body.status === 'Rescheduled' && keys.every(k => ['appointmentDate', 'timeSlot', 'status'].includes(k))) return 'status';
    return 'edit';
};

exports.getAppointments = async (req, res) => {
    try {
        // Everyone (superadmin, admin, team) sees all appointments, regardless of who created them
        let filter = {};

        if (req.query.mobile) {
            // History for a mobile number: appointments of every patient sharing this number
            const samePhonePatients = await Patient.find({ mobileNumber: req.query.mobile }).select('_id');
            filter.patientId = { $in: samePhonePatients.map(p => p._id) };
        } else if (req.query.patientId) {
            filter.patientId = req.query.patientId;
        }

        if (req.query.date) {
            const startOfDay = new Date(req.query.date);
            startOfDay.setUTCHours(0,0,0,0);
            const endOfDay = new Date(req.query.date);
            endOfDay.setUTCHours(23,59,59,999);
            filter.appointmentDate = { $gte: startOfDay, $lte: endOfDay };
        }

        const appointments = await Appointment.find(filter)
            .populate('patientId', 'fullName mobileNumber patientId age gender')
            .populate('createdBy', 'name role')
            .sort({ appointmentDate: 1, createdAt: 1 }); // timeline order
        res.status(200).json(appointments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createAppointment = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'appointments:create'))) return denied(res);
        let adminId = req.user.userId;
        if (req.user.role === 'team') {
            const user = await User.findById(req.user.userId);
            adminId = user ? (user.adminId || null) : null;
        }

        const appointment = new Appointment({
            ...req.body,
            adminId,
            createdBy: req.user.userId
        });
        await appointment.save();
        res.status(201).json(appointment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateAppointmentStatus = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'appointments:status'))) return denied(res);
        const { id } = req.params;
        const { status } = req.body;
        const appointment = await Appointment.findByIdAndUpdate(id, { status }, { new: true });
        res.status(200).json(appointment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.deleteAppointment = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'appointments:delete'))) return denied(res);
        const { id } = req.params;
        await Appointment.findByIdAndDelete(id);
        res.status(200).json({ message: 'Appointment deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateAppointment = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'appointments:' + updateActionFor(req.body)))) return denied(res);
        const { id } = req.params;
        const updated = await Appointment.findByIdAndUpdate(id, req.body, { new: true });
        res.status(200).json(updated);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
