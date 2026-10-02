const Attendance = require('../models/Attendance');
const User = require('../models/User');
const CompanyHoliday = require('../models/CompanyHoliday');
const moment = require('moment');

// Helper to calculate minutes between "HH:mm" strings
const calculateScheduledMinutes = (timings) => {
    let totalMinutes = 0;
    if (!timings || timings.length === 0) return 480; // default 8 hours

    timings.forEach(t => {
        if (t.startTime && t.endTime) {
            const start = moment(t.startTime, 'HH:mm');
            let end = moment(t.endTime, 'HH:mm');
            if (end.isBefore(start)) {
                end.add(1, 'days'); // shift crosses midnight
            }
            totalMinutes += end.diff(start, 'minutes');
        }
    });
    return totalMinutes > 0 ? totalMinutes : 480;
};

exports.getTodayStatus = async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const [attendance, user] = await Promise.all([
            Attendance.findOne({ userId: req.user.userId, date: today }),
            User.findById(req.user.userId).select('timingType timings')
        ]);
        res.json({
            ...(attendance ? (attendance._doc || attendance) : { status: 'none' }),
            timingType: user?.timingType || 'normal',
            timings: user?.timings || []
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching today status', error: error.message });
    }
};

exports.clockIn = async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const shiftIndex = parseInt(req.body.shiftIndex !== undefined ? req.body.shiftIndex : 0, 10);
        
        const user = await User.findById(req.user.userId);
        const userTimings = user?.timings || [];
        
        // Check if shift has already ended
        if (userTimings[shiftIndex]?.endTime) {
            const shiftEnd = moment(`${today} ${userTimings[shiftIndex].endTime}`, 'YYYY-MM-DD HH:mm');
            if (userTimings[shiftIndex].startTime && moment(userTimings[shiftIndex].endTime, 'HH:mm').isBefore(moment(userTimings[shiftIndex].startTime, 'HH:mm'))) {
                shiftEnd.add(1, 'day'); // overnight shift
            }
            if (moment().isAfter(shiftEnd)) {
                return res.status(400).json({ 
                    message: `Shift ${shiftIndex + 1} has already ended at ${shiftEnd.format('hh:mm A')}` 
                });
            }
        }

        // If 2nd shift (or shiftIndex > 0), check 5-minute rule before shift start:
        if (shiftIndex > 0 && userTimings[shiftIndex]?.startTime) {
            const shiftStart = moment(`${today} ${userTimings[shiftIndex].startTime}`, 'YYYY-MM-DD HH:mm');
            const allowedTime = shiftStart.clone().subtract(5, 'minutes');
            const now = moment();
            if (now.isBefore(allowedTime)) {
                return res.status(400).json({ 
                    message: `Shift ${shiftIndex + 1} Clock In opens at ${allowedTime.format('hh:mm A')} (5 mins before shift start)` 
                });
            }
        }

        let attendance = await Attendance.findOne({ userId: req.user.userId, date: today });
        if (!attendance) {
            attendance = new Attendance({
                userId: req.user.userId,
                date: today,
                shifts: [],
                status: 'present'
            });
        }

        if (!attendance.shifts) attendance.shifts = [];

        // Check if shift is already clocked in
        let existingShift = attendance.shifts.find(s => s.shiftIndex === shiftIndex);
        if (existingShift && existingShift.clockIn) {
            return res.status(400).json({ message: `Already clocked in for Shift ${shiftIndex + 1} today` });
        }

        if (!existingShift) {
            attendance.shifts.push({
                shiftIndex,
                clockIn: new Date()
            });
        } else {
            existingShift.clockIn = new Date();
        }

        // Set primary clockIn if not set
        if (!attendance.clockIn) {
            attendance.clockIn = new Date();
        }

        await attendance.save();
        res.json({ message: 'Clocked in successfully', attendance });
    } catch (error) {
        res.status(500).json({ message: 'Error clocking in', error: error.message });
    }
};

exports.clockOut = async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const shiftIndex = parseInt(req.body.shiftIndex !== undefined ? req.body.shiftIndex : 0, 10);

        let attendance = await Attendance.findOne({ userId: req.user.userId, date: today });
        if (!attendance) {
            return res.status(400).json({ message: 'No attendance record found for today' });
        }

        if (!attendance.shifts) attendance.shifts = [];
        let shift = attendance.shifts.find(s => s.shiftIndex === shiftIndex);
        
        // Backward compatibility if shifts array was empty but clockIn exists
        if (!shift || !shift.clockIn) {
            if (shiftIndex === 0 && attendance.clockIn && !attendance.clockOut) {
                shift = { shiftIndex: 0, clockIn: attendance.clockIn };
                attendance.shifts.push(shift);
            } else {
                return res.status(400).json({ message: `No clock in found for Shift ${shiftIndex + 1}` });
            }
        }

        if (shift.clockOut) {
            return res.status(400).json({ message: `Already clocked out for Shift ${shiftIndex + 1}` });
        }

        shift.clockOut = new Date();
        attendance.clockOut = new Date();

        // Calculate hours across all completed shifts if not manually overridden
        if (!attendance.isManualOverride) {
            const user = await User.findById(req.user.userId);
            const scheduledMinutes = calculateScheduledMinutes(user.timings);
            
            let totalWorkedMinutes = 0;
            attendance.shifts.forEach(s => {
                if (s.clockIn && s.clockOut) {
                    totalWorkedMinutes += moment(s.clockOut).diff(moment(s.clockIn), 'minutes');
                }
            });

            // If worked > half of scheduled time, full day. Else half day.
            if (totalWorkedMinutes > (scheduledMinutes / 2)) {
                attendance.status = 'present';
            } else {
                attendance.status = 'half-day';
            }
        }

        await attendance.save();
        res.json({ message: 'Clocked out successfully', attendance });
    } catch (error) {
        res.status(500).json({ message: 'Error clocking out', error: error.message });
    }
};

exports.getAttendanceList = async (req, res) => {
    try {
        const { date, startDate, endDate } = req.query; // date for daily view, startDate/endDate for calendar view
        
        let query = {};
        const userRole = (req.user.role || '').toLowerCase();
        
        if (userRole === 'admin') {
            query = { role: { $in: ['admin', 'team'] } };
        } else if (userRole === 'superadmin') {
            query = { role: { $in: ['superadmin', 'admin', 'team'] } };
        } else {
            return res.status(403).json({ message: 'Unauthorized access to attendance list' });
        }

        const users = await User.find(query).select('name email role category timingType timings');
        const userIds = users.map(u => u._id);

        let attendanceRecords = [];
        let holidaysMap = {};
        if (date) {
            attendanceRecords = await Attendance.find({ userId: { $in: userIds }, date });
            const holidays = await CompanyHoliday.find({ date });
            holidays.forEach(h => holidaysMap[h.date] = h.isPaid ? 'holiday' : 'unpaid-holiday');
        } else if (startDate && endDate) {
            attendanceRecords = await Attendance.find({ 
                userId: { $in: userIds }, 
                date: { $gte: startDate, $lte: endDate } 
            });
            const holidays = await CompanyHoliday.find({ date: { $gte: startDate, $lte: endDate } });
            holidays.forEach(h => holidaysMap[h.date] = h.isPaid ? 'holiday' : 'unpaid-holiday');
        }

        // If date range is specified (startDate && endDate)
        if (startDate && endDate) {
            const usersMap = {};
            users.forEach(u => {
                usersMap[u._id.toString()] = {
                    _id: u._id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    category: u.category,
                    timingType: u.timingType,
                    timings: u.timings || []
                };
            });

            const dates = [];
            let curr = moment(startDate);
            const stop = moment(endDate);
            while (curr.isSameOrBefore(stop)) {
                dates.push(curr.format('YYYY-MM-DD'));
                curr.add(1, 'days');
            }

            const recordsMap = {};
            attendanceRecords.forEach(a => {
                recordsMap[`${a.userId.toString()}_${a.date}`] = a;
            });

            const enriched = [];
            dates.forEach(d => {
                const isPastOrToday = moment(d).isSameOrBefore(moment(), 'day');
                users.forEach(user => {
                    const key = `${user._id.toString()}_${d}`;
                    let rec = recordsMap[key];
                    if (!rec) {
                        rec = {
                            _id: `temp_${user._id}_${d}`,
                            userId: user._id,
                            date: d,
                            clockIn: null,
                            clockOut: null,
                            status: holidaysMap[d] ? holidaysMap[d] : (isPastOrToday ? 'leave' : 'none'),
                            isManualOverride: false
                        };
                    }
                    enriched.push({
                        ...(rec._doc || rec),
                        user: usersMap[user._id.toString()]
                    });
                });
            });

            enriched.sort((a, b) => b.date.localeCompare(a.date) || a.user.name.localeCompare(b.user.name));
            return res.json(enriched);
        }

        // For a single date view, fill in 'leave' for users who didn't clock in
        if (date) {
            const today = moment().format('YYYY-MM-DD');
            const isPastOrToday = moment(date).isSameOrBefore(moment(), 'day');
            
            const recordsMap = {};
            attendanceRecords.forEach(a => recordsMap[a.userId.toString()] = a);

            const enrichedRecords = users.map(user => {
                let rec = recordsMap[user._id.toString()];
                if (!rec) {
                    rec = {
                        _id: `temp_${user._id}`,
                        userId: user._id,
                        date,
                        clockIn: null,
                        clockOut: null,
                        status: holidaysMap[date] ? holidaysMap[date] : (isPastOrToday ? 'leave' : 'none'),
                        isManualOverride: false
                    };
                }
                return {
                    ...rec._doc || rec,
                    user: { 
                        _id: user._id, 
                        name: user.name, 
                        email: user.email, 
                        role: user.role, 
                        category: user.category,
                        timingType: user.timingType,
                        timings: user.timings || []
                    }
                };
            });
            return res.json(enrichedRecords);
        }

        res.json(attendanceRecords);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching attendance', error: error.message });
    }
};

exports.updateAttendanceStatus = async (req, res) => {
    try {
        const { userId, date, status, clockIn, clockOut } = req.body;

        let attendance = await Attendance.findOne({ userId, date });
        if (!attendance) {
            attendance = new Attendance({ 
                userId, 
                date, 
                status: status || 'present', 
                isManualOverride: true 
            });
        } else {
            if (status) attendance.status = status;
            attendance.isManualOverride = true;
        }

        // If clockIn time string is provided (e.g., "09:30" or ISO Date string)
        if (clockIn !== undefined) {
            if (clockIn) {
                if (typeof clockIn === 'string' && clockIn.includes(':') && !clockIn.includes('T')) {
                    attendance.clockIn = moment(`${date} ${clockIn}`, 'YYYY-MM-DD HH:mm').toDate();
                } else {
                    attendance.clockIn = new Date(clockIn);
                }
            } else {
                attendance.clockIn = null;
            }
        }

        // If clockOut time string is provided (e.g., "18:00" or ISO Date string)
        if (clockOut !== undefined) {
            if (clockOut) {
                if (typeof clockOut === 'string' && clockOut.includes(':') && !clockOut.includes('T')) {
                    attendance.clockOut = moment(`${date} ${clockOut}`, 'YYYY-MM-DD HH:mm').toDate();
                } else {
                    attendance.clockOut = new Date(clockOut);
                }
            } else {
                attendance.clockOut = null;
            }
        }

        if (status && ['present', 'half-day', 'leave', 'holiday', 'unpaid-holiday'].includes(status)) {
            attendance.status = status;
        }

        await attendance.save();
        res.json({ message: 'Attendance updated successfully', attendance });
    } catch (error) {
        res.status(500).json({ message: 'Error updating attendance', error: error.message });
    }
};
