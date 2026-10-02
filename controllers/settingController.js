const Setting = require('../models/Setting');
const User = require('../models/User');

exports.getSettings = async (req, res) => {
    try {
        let adminId = req.user.userId;
        if (req.user.role === 'team') {
            const user = await User.findById(req.user.userId);
            adminId = user?.adminId;
        }

        let settings = adminId ? await Setting.findOne({ adminId }) : null;
        if (!settings) {
            // Check if any existing setting exists in DB (e.g. created by Superadmin/Admin)
            settings = await Setting.findOne();
        }

        if (!settings) {
            if (adminId) {
                settings = new Setting({ adminId });
                await settings.save();
            } else {
                return res.status(200).json({
                    clinicContactNumber: '',
                    birthdayMessageTemplate: 'Dear {Name}, wishing you a very Happy Birthday from Satguru Clinic! Have a wonderful and healthy year ahead. For appointments, call us at {ClinicNumber}.',
                    adminCategories: ['Receptionist', 'Manager'],
                    teamCategories: ['Doctor', 'Nurse', 'Staff'], consultationFee: 500
                });
            }
        }
        res.status(200).json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to update settings' });
        }

        const { clinicContactNumber, birthdayMessageTemplate, adminCategories, teamCategories, consultationFee } = req.body;
        
        let settings = await Setting.findOne({ adminId: req.user.userId });
        if (!settings) {
            settings = new Setting({ adminId: req.user.userId });
        }

        if (clinicContactNumber !== undefined) settings.clinicContactNumber = clinicContactNumber;
        if (birthdayMessageTemplate !== undefined) settings.birthdayMessageTemplate = birthdayMessageTemplate;
        if (adminCategories !== undefined) settings.adminCategories = adminCategories;
        if (teamCategories !== undefined) settings.teamCategories = teamCategories;
        if (consultationFee !== undefined) settings.consultationFee = consultationFee;
        
        await settings.save();
        res.status(200).json(settings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
