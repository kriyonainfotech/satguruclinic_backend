const Patient = require('../models/Patient');
const User = require('../models/User');
const Appointment = require('../models/Appointment');

// Get all patients
exports.getPatients = async (req, res) => {
    try {
        let filter = {}; // No filter, everyone sees all patients

        const patients = await Patient.find(filter)
                                      .populate('assignedTeamMember', 'name')
                                      .populate('createdBy', 'name role')
                                      .sort({ createdAt: -1 })
                                      .lean();
                                      
        const patientsWithCounts = await Promise.all(patients.map(async (p) => {
            const count = await Appointment.countDocuments({ patientId: p._id });
            return { ...p, appointmentCount: count };
        }));

        res.status(200).json(patientsWithCounts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Search patient by mobile
exports.searchPatient = async (req, res) => {
    try {
        const { mobile } = req.query;
        if (!mobile) return res.status(400).json({ message: 'Mobile number required' });

        let filter = { mobileNumber: mobile }; // No role filter

        const patient = await Patient.findOne(filter);
        if (patient) {
            return res.status(200).json(patient);
        }
        return res.status(404).json({ message: 'Patient not found' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Add new patient
exports.addPatient = async (req, res) => {
    try {
        // Only Admin and Team can add patients
        if (!['superadmin', 'admin', 'team'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Not authorized to add patients' });
        }

        let adminId;
        if (req.user.role === 'admin') {
            adminId = req.user.userId;
        } else if (req.user.role === 'team') {
            const user = await User.findById(req.user.userId);
            adminId = user ? (user.adminId || null) : null;
        }

        // Generate patientId (e.g. PAT-01)
        const count = await Patient.countDocuments();
        const patientId = `PAT-${String(count + 1).padStart(2, '0')}`;

        const newPatient = new Patient({
            ...req.body,
            patientId,
            adminId,
            createdBy: req.user.userId
        });

        await newPatient.save();
        res.status(201).json(newPatient);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update patient
exports.updatePatient = async (req, res) => {
    try {
        const { id } = req.params;
        const patient = await Patient.findById(id);
        
        if (!patient) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        // Authorization check
        if (req.user.role === 'admin' && patient.adminId.toString() !== req.user.userId) {
            return res.status(403).json({ message: 'Not authorized to edit this patient' });
        } else if (req.user.role === 'team') {
            const user = await User.findById(req.user.userId);
            if (patient.adminId.toString() !== user.adminId?.toString()) {
                return res.status(403).json({ message: 'Not authorized to edit this patient' });
            }
        }

        const updatedPatient = await Patient.findByIdAndUpdate(id, req.body, { new: true });
        res.status(200).json(updatedPatient);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete patient
exports.deletePatient = async (req, res) => {
    try {
        const { id } = req.params;
        const patient = await Patient.findById(id);
        
        if (!patient) {
            return res.status(404).json({ message: 'Patient not found' });
        }

        // Authorization check
        if (req.user.role === 'admin' && patient.adminId.toString() !== req.user.userId) {
            return res.status(403).json({ message: 'Not authorized to delete this patient' });
        } else if (req.user.role === 'team') {
            return res.status(403).json({ message: 'Team members cannot delete patients' });
        }

        await Patient.findByIdAndDelete(id);
        res.status(200).json({ message: 'Patient deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// Get patients with birthday today
exports.getTodayBirthdays = async (req, res) => {
    try {
        let filter = {}; // No role filter

        const patients = await Patient.find(filter);
        const today = new Date();
        const todayMonth = today.getMonth();
        const todayDate = today.getDate();

        const birthdayPatients = patients.filter(p => {
            if (!p.dateOfBirth) return false;
            const dob = new Date(p.dateOfBirth);
            return dob.getMonth() === todayMonth && dob.getDate() === todayDate;
        });

        res.status(200).json(birthdayPatients);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
