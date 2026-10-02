const CompanyHoliday = require('../models/CompanyHoliday');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const moment = require('moment');

exports.getPayroll = async (req, res) => {
    try {
        const { month, year } = req.query; // format: MM, YYYY
        if (!month || !year) {
            return res.status(400).json({ message: 'Month and year are required' });
        }

        const startDate = moment(`${year}-${month}-01`);
        const endDate = startDate.clone().endOf('month');
        const daysInMonth = startDate.daysInMonth();
        
        let daysElapsed = daysInMonth;
        const today = moment();
        if (today.isSame(startDate, 'month')) {
            daysElapsed = today.date();
        } else if (today.isBefore(startDate)) {
            daysElapsed = 0;
        }

        const officialHolidays = await CompanyHoliday.find({
            isOfficial: true,
            date: {
                $gte: startDate.format('YYYY-MM-DD'),
                $lte: endDate.format('YYYY-MM-DD')
            }
        });
        
        const users = await User.find({ role: { $in: ['admin', 'team'] } }).select('-password');
        const attendanceRecords = await Attendance.find({
            date: {
                $gte: startDate.format('YYYY-MM-DD'),
                $lte: endDate.format('YYYY-MM-DD')
            }
        });

        let totalPayroll = 0;
        let accruedTillDate = 0;
        const payrollDetails = [];

        users.forEach(user => {
            const userAttendance = attendanceRecords.filter(a => a.userId.toString() === user._id.toString());
            let present = 0;
            let halfDay = 0;
            let leave = 0;

            userAttendance.forEach(a => {
                if (a.status === 'present') present++;
                else if (a.status === 'half-day') halfDay++;
                // holiday is ignored
            });
            
            let officialHolidaysPassed = 0;
            officialHolidays.forEach(h => {
                if (moment(h.date).isSameOrBefore(today, 'day')) {
                    officialHolidaysPassed += (h.isHalfDay ? 0.5 : 1);
                }
            });

            // Any day not marked as present or half-day is a leave (since 365 days are working days)
            leave = Math.max(0, daysElapsed - present - halfDay - officialHolidaysPassed);

            const salary = user.salary || 0;
            const oneDaySalary = salary / daysInMonth;
            
            // Paid days = Present + (0.5 * halfDay)
            let extraPaidDaysFromHolidays = 0;
            officialHolidays.forEach(h => {
                const hasAttendanceForHoliday = userAttendance.some(a => a.date === h.date && (a.status==='present' || a.status==='half-day'));
                if (h.isPaid && !hasAttendanceForHoliday) {
                    if (moment(h.date).isSameOrBefore(today, 'day')) {
                        extraPaidDaysFromHolidays += (h.isHalfDay ? 0.5 : 1);
                    }
                }
            });
            const paidDays = present + (0.5 * halfDay) + extraPaidDaysFromHolidays;
            
            const earned = paidDays * oneDaySalary;

            totalPayroll += salary;
            accruedTillDate += earned;

            payrollDetails.push({
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    category: user.category,
                    timings: user.timings,
                    timingType: user.timingType
                },
                stats: {
                    present,
                    halfDay,
                    leave,
                    paidHolidays: extraPaidDaysFromHolidays
                },
                totalDays: paidDays,
                daysInMonth,
                earned: Math.round(earned),
                salary,
                records: userAttendance
            });
        });

        res.json({
            summary: {
                totalPayroll,
                workingDays: daysInMonth, // or days excluding sundays if you want
                accruedTillDate: Math.round(accruedTillDate),
                totalPaid: 0 // Mock value for now
            },
            details: payrollDetails,
            officialHolidays
        });

    } catch (error) {
        console.error('Payroll Error:', error);
        res.status(500).json({ message: 'Error fetching payroll data', error: error.message });
    }
};

exports.getMyWallet = async (req, res) => {
    try {
        const userId = req.user.userId;
        const today = moment();
        const startDate = today.clone().startOf('month');
        const endDate = today.clone().endOf('month');
        const daysInMonth = today.daysInMonth();
        const daysElapsed = today.date();

        const officialHolidays = await CompanyHoliday.find({
            isOfficial: true,
            date: {
                $gte: startDate.format('YYYY-MM-DD'),
                $lte: endDate.format('YYYY-MM-DD')
            }
        });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const attendanceRecords = await Attendance.find({
            userId,
            date: {
                $gte: startDate.format('YYYY-MM-DD'),
                $lte: endDate.format('YYYY-MM-DD')
            }
        });

        let present = 0;
        let halfDay = 0;
        let leave = 0;

        attendanceRecords.forEach(a => {
            if (a.status === 'present') present++;
            else if (a.status === 'half-day') halfDay++;
        });

        let officialHolidaysPassed = 0;
        officialHolidays.forEach(h => {
            if (moment(h.date).isSameOrBefore(today, 'day')) {
                officialHolidaysPassed += (h.isHalfDay ? 0.5 : 1);
            }
        });

        leave = Math.max(0, daysElapsed - present - halfDay - officialHolidaysPassed);

        const salary = user.salary || 0;
        const oneDaySalary = salary / daysInMonth;
        
        let extraPaidDaysFromHolidays = 0;
        officialHolidays.forEach(h => {
            const hasAttendanceForHoliday = attendanceRecords.some(a => a.date === h.date && (a.status==='present' || a.status==='half-day'));
            if (h.isPaid && !hasAttendanceForHoliday) {
                if (moment(h.date).isSameOrBefore(today, 'day')) {
                    extraPaidDaysFromHolidays += (h.isHalfDay ? 0.5 : 1);
                }
            }
        });
        
        // Paid days = Present + (0.5 * halfDay) + Paid Holidays
        const paidDays = present + (0.5 * halfDay) + extraPaidDaysFromHolidays;
        
        const earned = paidDays * oneDaySalary;

        res.json({
            earned: Math.round(earned),
            target: salary,
            stats: { present, halfDay, leave, paidHolidays: extraPaidDaysFromHolidays },
            progress: salary > 0 ? Math.round((earned / salary) * 100) : 0
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching wallet data', error: error.message });
    }
};
