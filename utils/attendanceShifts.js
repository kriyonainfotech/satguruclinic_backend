const moment = require('moment');

// Helper to calculate minutes between "HH:mm" strings
const calculateScheduledMinutes = (timings) => {
    let totalMinutes = 0;
    if (!timings || timings.length === 0) return 480; // default 8 hours

    timings.forEach(t => {
        if (t.startTime && t.endTime) {
            const timeFormats = ['HH:mm', 'hh:mm A', 'h:mm A', 'hh:mm a', 'h:mm a'];
            const start = moment(t.startTime, timeFormats);
            let end = moment(t.endTime, timeFormats);
            if (end.isBefore(start)) {
                end.add(1, 'days'); // shift crosses midnight
            }
            totalMinutes += end.diff(start, 'minutes');
        }
    });
    return totalMinutes > 0 ? totalMinutes : 480;
};

const TIME_FORMATS = ['HH:mm', 'hh:mm A', 'h:mm A', 'hh:mm a', 'h:mm a'];
const momentOn = (date, time) => moment(`${date} ${time}`, TIME_FORMATS.map(f => `YYYY-MM-DD ${f}`));

// Shifts ke worked minutes se status (>= 75% present, >= 30% half-day, warna short-time)
const applyStatusFromShifts = (attendance, timings) => {
    const scheduledMinutes = calculateScheduledMinutes(timings);
    let workedMinutes = 0;
    attendance.shifts.forEach(s => {
        if (s.clockIn && s.clockOut) workedMinutes += moment(s.clockOut).diff(moment(s.clockIn), 'minutes');
    });
    if (workedMinutes >= scheduledMinutes * 0.75) attendance.status = 'present';
    else if (workedMinutes >= scheduledMinutes * 0.3) attendance.status = 'half-day';
    else attendance.status = 'short-time';
};

// Multi-shift: kisi shift ka clock out bhool gaye to us shift ke end time par apne aap clock out.
// Shift tab band hoti hai jab agli shift me clock in ho jaye, agli shift ka start time aa jaye, ya din nikal jaye.
// (Last shift aaj ke din khuli rehti hai — late tak kaam ho sakta hai)
const autoCloseForgottenShifts = (attendance, timings) => {
    if (!attendance || !Array.isArray(attendance.shifts) || !timings || timings.length < 2) return false;
    const now = moment();
    const isPastDay = attendance.date < now.format('YYYY-MM-DD');
    let changed = false;

    attendance.shifts.forEach(shift => {
        if (!shift.clockIn || shift.clockOut) return;
        const idx = shift.shiftIndex || 0;
        const t = timings[idx];
        if (!t || !t.startTime || !t.endTime) return;

        const laterClockedIn = attendance.shifts.some(s => (s.shiftIndex || 0) > idx && s.clockIn);
        const next = timings[idx + 1];
        const nextStarted = next && next.startTime && now.isSameOrAfter(momentOn(attendance.date, next.startTime));
        if (!isPastDay && !laterClockedIn && !nextStarted) return;

        const start = momentOn(attendance.date, t.startTime);
        const end = momentOn(attendance.date, t.endTime);
        if (end.isBefore(start)) end.add(1, 'days'); // shift raat 12 ke baad khatam
        if (end.isAfter(now)) return; // shift abhi khatam nahi hui

        // Shift end ke baad clock in kiya tha to 0 minute (clock in time par hi band)
        shift.clockOut = moment.max(end, moment(shift.clockIn)).toDate();
        changed = true;
    });

    if (changed) {
        const outs = attendance.shifts.filter(s => s.clockOut).map(s => moment(s.clockOut));
        if (outs.length) attendance.clockOut = moment.max(outs).toDate();
        // Status tabhi badlo jab koi shift khuli na ho (beech din me clock in pe status na gire)
        const anyOpen = attendance.shifts.some(s => s.clockIn && !s.clockOut);
        if (!attendance.isManualOverride && !anyOpen) applyStatusFromShifts(attendance, timings);
    }
    return changed;
};

module.exports = { calculateScheduledMinutes, autoCloseForgottenShifts };
