const Attendance = require('../models/Attendance');
const User = require('../models/User');
const CompanyHoliday = require('../models/CompanyHoliday');
const moment = require('moment');
const { getUserPermissions, checkPermission } = require('../utils/permissions');
const { runPhotoCleanup } = require('../utils/photoCleanup');
const { calculateScheduledMinutes, autoCloseForgottenShifts } = require('../utils/attendanceShifts');

// Selfie photo hata do (jinko 'attendance:photos' permission nahi hai)
const stripPhotos = (records) => records.map(r => {
    const obj = r && r.toObject ? r.toObject() : { ...r };
    delete obj.photo;
    if (Array.isArray(obj.shifts)) {
        obj.shifts = obj.shifts.map(sh => {
            const shObj = sh && sh.toObject ? sh.toObject() : { ...sh };
            delete shObj.photo;
            return shObj;
        });
    }
    return obj;
});

// Team member ko kin users ki attendance dikhe: 'view-team' on ho to apne admin ki poori team, warna sirf khud
const getTeamScopeQuery = (reqUser, permissions) => {
    if (checkPermission(permissions, 'attendance:view-team') && reqUser.adminId) {
        return { adminId: reqUser.adminId, role: 'team' };
    }
    return { _id: reqUser.userId };
};

exports.getTodayStatus = async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const [attendance, user] = await Promise.all([
            Attendance.findOne({ userId: req.user.userId, date: today }),
            User.findById(req.user.userId).select('timingType timings')
        ]);
        if (attendance && autoCloseForgottenShifts(attendance, user?.timings)) await attendance.save();
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
        await runPhotoCleanup();
        const today = moment().format('YYYY-MM-DD');
        const shiftIndex = parseInt(req.body.shiftIndex !== undefined ? req.body.shiftIndex : 0, 10);
        const { photo, isMobile } = req.body;
        
        // Team member requires live photo verification when clocking in via mobile device
        if (req.user.role === 'team' && isMobile && !photo) {
            return res.status(400).json({ message: 'Live photo verification is required to Clock In on mobile' });
        }

        // Clock In kabhi bhi ho sakta hai (shift se pehle ya baad). Jaldi aane / late jaane ka
        // time payroll me clock-in se clock-out tak ke total time (15-min slot) me jud jata hai.

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
                clockIn: new Date(),
                photo: photo || undefined
            });
        } else {
            existingShift.clockIn = new Date();
            if (photo) existingShift.photo = photo;
        }

        // Set primary clockIn and photo if not set
        if (!attendance.clockIn) {
            attendance.clockIn = new Date();
        }
        if (photo && !attendance.photo) {
            attendance.photo = photo;
        }

        // Pichhli shift ka clock out bhool gaye ho to wo shift apne end time par band ho jaye
        const clockInUser = await User.findById(req.user.userId).select('timings');
        autoCloseForgottenShifts(attendance, clockInUser?.timings);

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

            // Match stats thresholds: >= 75% = present, >= 30% = half-day, else short-time
            if (totalWorkedMinutes >= (scheduledMinutes * 0.75)) {
                attendance.status = 'present';
            } else if (totalWorkedMinutes >= (scheduledMinutes * 0.3)) {
                attendance.status = 'half-day';
            } else {
                attendance.status = 'short-time';
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
        // 7 din se purani selfie photos hatao (har 6 ghante me ek baar)
        await runPhotoCleanup();
        const { date, startDate, endDate } = req.query; // date for daily view, startDate/endDate for calendar view
        
        let query = {};
        const userRole = (req.user.role || '').toLowerCase();
        const permissions = await getUserPermissions(req.user);

        if (!checkPermission(permissions, 'attendance')) {
            return res.status(403).json({ message: 'Unauthorized access to attendance list' });
        }

        if (userRole === 'admin') {
            query = { adminId: req.user.userId, role: { $ne: 'superadmin' } };
        } else if (userRole === 'superadmin') {
            query = { role: { $in: ['admin', 'team'] } };
        } else {
            query = getTeamScopeQuery(req.user, permissions);
        }

        const canSeePhotos = checkPermission(permissions, 'attendance:photos');
        const send = (records) => res.json(canSeePhotos ? records : stripPhotos(records));

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

        // Multi-shift me jinka clock out reh gaya, unki shift end time par band karo
        const timingsByUser = {};
        users.forEach(u => { timingsByUser[u._id.toString()] = u.timings; });
        await Promise.all(attendanceRecords.map(a =>
            autoCloseForgottenShifts(a, timingsByUser[a.userId.toString()]) ? a.save() : null
        ));

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
            return send(enriched);
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
            return send(enrichedRecords);
        }

        send(attendanceRecords);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching attendance', error: error.message });
    }
};

exports.updateAttendanceStatus = async (req, res) => {
    try {
        const { userId, date, status, clockIn, clockOut, photo } = req.body;

        const permissions = await getUserPermissions(req.user);
        if (!checkPermission(permissions, 'attendance:edit')) {
            return res.status(403).json({ message: 'Aapko attendance edit karne ki permission nahi hai' });
        }
        // Team member sirf apne scope (khud / apni team) ki attendance edit kar sakta hai
        if (req.user.role === 'team') {
            const scope = getTeamScopeQuery(req.user, permissions);
            const allowed = scope._id
                ? String(userId) === String(req.user.userId)
                : await User.exists({ ...scope, _id: userId });
            if (!allowed) {
                return res.status(403).json({ message: 'Aap is user ki attendance edit nahi kar sakte' });
            }
        }

        let attendance = await Attendance.findOne({ userId, date });
        if (!attendance) {
            attendance = new Attendance({ 
                userId, 
                date, 
                status: status || 'present', 
                photo: photo || undefined,
                isManualOverride: true 
            });
        } else {
            if (status) attendance.status = status;
            if (photo) attendance.photo = photo;
            attendance.isManualOverride = true;
        }

        // If clockIn time string is provided (e.g., "09:30" or ISO Date string)
        if (clockIn !== undefined) {
            if (clockIn) {
                if (typeof clockIn === 'string' && clockIn.includes(':') && !clockIn.includes('T')) {
                    const timeFormats = ['HH:mm', 'hh:mm A', 'h:mm A', 'hh:mm a', 'h:mm a'];
                    attendance.clockIn = moment(`${date} ${clockIn}`, timeFormats.map(f => `YYYY-MM-DD ${f}`)).toDate();
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
                    const timeFormats = ['HH:mm', 'hh:mm A', 'h:mm A', 'hh:mm a', 'h:mm a'];
                    attendance.clockOut = moment(`${date} ${clockOut}`, timeFormats.map(f => `YYYY-MM-DD ${f}`)).toDate();
                } else {
                    attendance.clockOut = new Date(clockOut);
                }
            } else {
                attendance.clockOut = null;
            }
        }

        // Manual time ko shifts me bhi sync karo (payroll shifts se hi hours ginta hai)
        if (clockIn !== undefined || clockOut !== undefined) {
            if (!attendance.clockIn && !attendance.clockOut) {
                attendance.shifts = [];
            } else {
                if (!attendance.shifts || attendance.shifts.length === 0) {
                    attendance.shifts = [{ shiftIndex: 0, photo: attendance.photo || undefined }];
                }
                const sorted = [...attendance.shifts].sort((a, b) => (a.shiftIndex || 0) - (b.shiftIndex || 0));
                const firstShift = sorted[0];
                // Clock out last shift me jata hai jisme clock in hua ho (multi-shift me)
                const lastShift = [...sorted].reverse().find(s => s.clockIn) || firstShift;
                if (clockIn !== undefined) firstShift.clockIn = attendance.clockIn || undefined;
                if (clockOut !== undefined) lastShift.clockOut = attendance.clockOut || undefined;
            }

            // Status nahi bheja to clock in / out ke time se calculate karo
            if (!status && attendance.clockIn && attendance.clockOut) {
                const user = await User.findById(userId).select('timings');
                const scheduledMinutes = calculateScheduledMinutes(user?.timings);
                let workedMinutes = 0;
                attendance.shifts.forEach(s => {
                    if (s.clockIn && s.clockOut) workedMinutes += moment(s.clockOut).diff(moment(s.clockIn), 'minutes');
                });
                if (workedMinutes >= scheduledMinutes * 0.75) attendance.status = 'present';
                else if (workedMinutes >= scheduledMinutes * 0.3) attendance.status = 'half-day';
                else attendance.status = 'short-time';
            }
        }

        if (status && ['present', 'half-day', 'short-time', 'leave', 'holiday', 'unpaid-holiday'].includes(status)) {
            attendance.status = status;
        }

        await attendance.save();
        res.json({ message: 'Attendance updated successfully', attendance });
    } catch (error) {
        res.status(500).json({ message: 'Error updating attendance', error: error.message });
    }
};
