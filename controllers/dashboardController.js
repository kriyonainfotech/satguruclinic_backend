const Invoice = require('../models/Invoice');
const Collection = require('../models/Collection');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Service = require('../models/Service');
const Package = require('../models/Package');
const Appointment = require('../models/Appointment');
const Task = require('../models/Task');
const Attendance = require('../models/Attendance');
const moment = require('moment');

exports.getSuperadminDashboard = async (req, res) => {
    try {
        if (req.user.role !== 'superadmin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const now = moment();
        const startOfMonth = moment().startOf('month').toDate();
        const endOfMonth = moment().endOf('month').toDate();
        
        const startOfDay = moment().startOf('day').toDate();
        const endOfDay = moment().endOf('day').toDate();

        // 1. Total Outstanding (Sum of balance in all Invoices)
        const invoices = await Invoice.find({});
        const totalOutstanding = invoices.reduce((acc, inv) => acc + (inv.balance || 0), 0);

        // 2. Collection of Current Month
        const monthlyCollections = await Collection.find({
            createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        });
        const currentMonthCollection = monthlyCollections.reduce((acc, col) => acc + (col.amount || 0), 0);

        // 3. Total Available Fund (Total of all collections ever, minus expenses if needed. For now just sum of all collections)
        const allCollections = await Collection.find({});
        const totalAvailableFund = allCollections.reduce((acc, col) => acc + (col.amount || 0), 0);

        // 4. Current Month Sale (Sum of total in invoices created this month)
        const monthlyInvoices = await Invoice.find({
            createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        });
        const currentMonthSale = monthlyInvoices.reduce((acc, inv) => acc + (inv.total || 0), 0);

        // 5. Counts
        const servicesCount = await Service.countDocuments();
        const packagesCount = await Package.countDocuments();
        const patientsCount = await Patient.countDocuments();
        
        // Today Appointments
        const appointmentsTodayCount = await Appointment.countDocuments({
            date: moment().format('YYYY-MM-DD')
        });

        // Teams & Admins
        const teamMembersCount = await User.countDocuments({ role: 'team' });
        const adminsCount = await User.countDocuments({ role: 'admin' });

        // 6. User Daily Work (Rituals) - Superadmin's Today's Tasks
        const todayTasks = await Task.find({
            assignedTo: req.user.userId,
            dueDate: { $gte: startOfDay, $lte: endOfDay }
        }).populate('assignedTo', 'name');

        const rituals = todayTasks.map(t => ({
            name: t.title,
            time: moment(t.dueDate).format('hh:mm A'),
            status: t.status === 'Completed' || t.status === 'Done' ? 'completed' : 'pending'
        }));

        // 7. Team Graph Data
        const teamUsers = await User.find({ role: { $in: ['admin', 'team'] } });
        
        const graphData = [];
        for (const user of teamUsers) {
            // Find all attendance records for this user
            const attendances = await Attendance.find({ userId: user._id });
            const presentDays = attendances.filter(a => a.status === 'present').length;
            const totalDays = attendances.length || 1;
            const attendancePercent = Math.round((presentDays / totalDays) * 100);

            // Fetch tasks assigned to this user
            const userTasks = await Task.find({ assignedTo: user._id });
            const completedTasks = userTasks.filter(t => t.status === 'Completed' || t.status === 'Done').length;
            const tasksPercent = userTasks.length ? Math.round((completedTasks / userTasks.length) * 100) : 100;
            
            // Punctuality dummy logic for now
            const punctualityPercent = Math.max(0, attendancePercent - Math.floor(Math.random() * 10));

            graphData.push({
                name: user.name,
                attendance: attendancePercent,
                punctuality: punctualityPercent,
                tasks: tasksPercent
            });
        }

        res.json({
            financials: {
                totalAvailableFund,
                totalOutstanding,
                currentMonthSale,
                currentMonthCollection
            },
            counts: {
                services: servicesCount,
                packages: packagesCount,
                patients: patientsCount,
                appointmentsToday: appointmentsTodayCount,
                teamMembers: teamMembersCount,
                admins: adminsCount
            },
            rituals: rituals,
            teamGraph: graphData
        });

    } catch (error) {
        console.error('Superadmin dashboard error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
