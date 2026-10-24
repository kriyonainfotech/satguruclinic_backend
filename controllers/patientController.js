const Patient = require('../models/Patient');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

// Get all patients
exports.getPatients = async (req, res) => {
    try {
        let filter = {}; // No filter, everyone sees all patients

        const patients = await Patient.find(filter)
                                      .populate('assignedTeamMember', 'name')
                                      .populate('createdBy', 'name role')
                                      .sort({ createdAt: -1 })
                                      .lean();
                                      
        // Appointment count is shared by all patients on the same mobile number
        const idsByMobile = {};
        patients.forEach(p => {
            (idsByMobile[p.mobileNumber] = idsByMobile[p.mobileNumber] || []).push(p._id);
        });
        const patientsWithCounts = await Promise.all(patients.map(async (p) => {
            const ids = p.mobileNumber ? idsByMobile[p.mobileNumber] : [p._id];
            const count = await Appointment.countDocuments({ patientId: { $in: ids } });
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

        // ?all=1 -> return every patient registered on this number
        if (req.query.all) {
            const patients = await Patient.find(filter).sort({ createdAt: -1 });
            return res.status(200).json(patients);
        }

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
        // Appointments page se naya patient bhi yahin banta hai, isliye dono me se ek permission kaafi hai
        if (!(await hasPermission(req.user, 'patients:create')) && !(await hasPermission(req.user, 'appointments:create'))) {
            return denied(res);
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
        // Sirf status bheja ho to status toggle hai, warna poora edit
        const keys = Object.keys(req.body || {});
        const action = keys.length === 1 && keys[0] === 'status' ? 'status' : 'edit';
        if (!(await hasPermission(req.user, 'patients:' + action))) return denied(res);

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

        // Keep age in sync with DOB (DOB is optional, so clear age if DOB removed)
        if ('dateOfBirth' in req.body) {
            if (req.body.dateOfBirth) {
                const today = new Date();
                const birthDate = new Date(req.body.dateOfBirth);
                let age = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }
                req.body.age = age;
            } else {
                req.body.dateOfBirth = null;
                req.body.age = null;
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
            const user = await User.findById(req.user.userId);
            if (patient.adminId?.toString() !== user?.adminId?.toString()) {
                return res.status(403).json({ message: 'Not authorized to delete this patient' });
            }
        }
        // Team ke liye pehle hamesha band tha, ab Superadmin 'patients:delete' se on kar sakta hai
        if (!(await hasPermission(req.user, 'patients:delete'))) {
            return res.status(403).json({ message: 'Aapko patient delete karne ki permission nahi hai' });
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
