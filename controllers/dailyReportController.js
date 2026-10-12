const DailyReport = require('../models/DailyReport');
const User = require('../models/User');

// Create or Update daily report for a user on a specific date
exports.saveReport = async (req, res) => {
    try {
        const {
            userId: targetUserId,
            date,
            attendanceTiming,
            targetSales,
            callingLeads,
            patientDetails,
            taskManagement,
            compliance,
            followupPending
        } = req.body;

        if (!date) {
            return res.status(400).json({ message: 'Date is required' });
        }

        // Determine user to save report for:
        let userId = req.user.userId;
        if (req.user.role === 'superadmin' && targetUserId) {
            userId = targetUserId;
        } else if (req.user.role === 'admin' && targetUserId) {
            const targetEmployee = await User.findById(targetUserId);
            if (targetEmployee && (targetEmployee.adminId?.toString() === req.user.userId.toString() || targetEmployee._id.toString() === req.user.userId.toString())) {
                userId = targetUserId;
            } else {
                return res.status(403).json({ message: 'Not authorized to edit report for this user' });
            }
        }

        const employee = await User.findById(userId);
        if (!employee) {
            return res.status(404).json({ message: 'User not found' });
        }

        const payload = {
            userId,
            employeeName: employee.name,
            category: employee.category || '',
            date,
            adminId: employee.adminId || null,
            attendanceTiming: attendanceTiming || {},
            targetSales: targetSales || {},
            callingLeads: callingLeads || {},
            patientDetails: patientDetails || {},
            taskManagement: taskManagement || {},
            compliance: compliance || {},
            followupPending: followupPending || {}
        };

        const report = await DailyReport.findOneAndUpdate(
            { userId, date },
            { $set: payload },
            { new: true, upsert: true, runValidators: true }
        );

        res.status(200).json({ message: 'Daily report saved successfully', report });
    } catch (error) {
        console.error('Error saving daily report:', error);
        res.status(500).json({ message: 'Failed to save daily report', error: error.message });
    }
};

// Get report for a specific user and date
exports.getUserReport = async (req, res) => {
    try {
        const { date, userId: paramUserId } = req.query;
        let userId = req.user.userId;

        if (req.user.role === 'superadmin' && paramUserId) {
            userId = paramUserId;
        } else if (req.user.role === 'admin' && paramUserId) {
            // Verify if target user belongs to this admin or is self
            const targetUser = await User.findById(paramUserId);
            if (targetUser && (targetUser.adminId?.toString() === req.user.userId.toString() || targetUser._id.toString() === req.user.userId.toString())) {
                userId = paramUserId;
            } else {
                return res.status(403).json({ message: 'Not authorized to view this user report' });
            }
        }

        const report = await DailyReport.findOne({ userId, date });
        res.status(200).json(report || null);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching report', error: error.message });
    }
};

// Get all reports for a specific date (or date range) for Superadmin / Admin
exports.getAllReports = async (req, res) => {
    try {
        const { date, month, startDate, endDate, userId } = req.query;
        let query = {};

        // Role-based scoping
        if (req.user.role === 'team') {
            query.userId = req.user.userId;
        } else if (req.user.role === 'admin') {
            // Find team members assigned to this admin + self
            const teamMembers = await User.find({ adminId: req.user.userId }).select('_id');
            const allowedIds = [req.user.userId.toString(), ...teamMembers.map(t => t._id.toString())];
            
            if (userId) {
                // If specific user requested, verify they belong to this admin
                if (allowedIds.includes(userId.toString())) {
                    query.userId = userId;
                } else {
                    return res.status(200).json([]); // Not in this admin's team
                }
            } else {
                query.userId = { $in: allowedIds };
            }
        } else if (userId && req.user.role === 'superadmin') {
            query.userId = userId;
        }

        if (date) {
            query.date = date;
        } else if (month) {
            query.date = { $regex: `^${month}` };
        } else if (startDate && endDate) {
            query.date = { $gte: startDate, $lte: endDate };
        }

        const reports = await DailyReport.find(query).sort({ date: -1, employeeName: 1 });
        res.status(200).json(reports);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching daily reports', error: error.message });
    }
};

// Delete a report
exports.deleteReport = async (req, res) => {
    try {
        const { id } = req.params;
        const report = await DailyReport.findById(id);
        if (!report) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // Authorization check
        if (req.user.role === 'team' && report.userId.toString() !== req.user.userId) {
            return res.status(403).json({ message: 'Not authorized to delete this report' });
        }

        await DailyReport.findByIdAndDelete(id);
        res.status(200).json({ message: 'Daily report deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting daily report', error: error.message });
    }
};
