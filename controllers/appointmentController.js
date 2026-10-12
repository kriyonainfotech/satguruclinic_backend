const Appointment = require('../models/Appointment');
const User = require('../models/User');

exports.getAppointments = async (req, res) => {
    try {
        let filter = {};
        if (req.user.role === 'admin') {
            // Admin can see their own appointments and appointments created by their team members
            const myTeamMembers = await User.find({ adminId: req.user.userId }).select('_id');
            const myTeamMemberIds = myTeamMembers.map(u => u._id);
            const allowedUserIds = [req.user.userId, ...myTeamMemberIds];
            filter.$or = [
                { adminId: req.user.userId },
                { createdBy: { $in: allowedUserIds } }
            ];
        } else if (req.user.role === 'team') {
            // Team member sees their own appointments
            filter.createdBy = req.user.userId;
        }
        // Superadmin has no role-based filter, so they can see all appointments (both admin and team)

        if (req.query.patientId) {
            // When fetching history from Patient DB, they can see all appointments for that patient regardless of creator
            delete filter.createdBy; 
            delete filter.$or;
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
            .sort({ appointmentDate: 1 });
        res.status(200).json(appointments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createAppointment = async (req, res) => {
    try {
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
        const { id } = req.params;
        await Appointment.findByIdAndDelete(id);
        res.status(200).json({ message: 'Appointment deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await Appointment.findByIdAndUpdate(id, req.body, { new: true });
        res.status(200).json(updated);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
