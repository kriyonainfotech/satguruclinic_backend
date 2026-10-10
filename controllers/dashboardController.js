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
const { calculatePerformance } = require('../utils/performanceHelper');

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
        const teamUsers = await User.find({ role: 'team' });
        
        const graphData = [];
        for (const user of teamUsers) {
            // Find all attendance records for this user
            const attendances = await Attendance.find({ userId: user._id });
            const userTasks = await Task.find({ assignedTo: user._id });
            const { attendancePercent, punctualityPercent, tasksPercent } = calculatePerformance(user, attendances, userTasks);
            
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


exports.getTeamMemberPerformance = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        const monthsData = [];
        
        for (let i = 5; i >= 0; i--) {
            const startOfMonth = moment().subtract(i, 'months').startOf('month').toDate();
            const endOfMonth = moment().subtract(i, 'months').endOf('month').toDate();
            const monthLabel = moment().subtract(i, 'months').format('MMM YYYY');
            
            const attendances = await Attendance.find({ 
                userId,
                date: { $gte: startOfMonth, $lte: endOfMonth }
            });
            
            const userTasks = await Task.find({ 
                assignedTo: userId,
                dueDate: { $gte: startOfMonth, $lte: endOfMonth }
            });
            
            const { attendancePercent, punctualityPercent, tasksPercent } = calculatePerformance(user, attendances, userTasks);
            
            monthsData.push({
                name: monthLabel,
                attendance: attendancePercent,
                punctuality: punctualityPercent,
                tasks: tasksPercent
            });
        }
        
        res.json({ performanceGraph: monthsData });
    } catch (error) {
        console.error('Team performance error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
