
const moment = require('moment');
const Task = require('../models/Task');

/**
 * Calculates the performance score for a user given their attendances and tasks.
 * @param {Object} user - The user object containing .timings
 * @param {Array} attendances - Array of Attendance documents for the period
 * @param {Array} tasks - Array of Task documents assigned to the user for the period
 * @returns {Object} { attendancePercent, punctualityPercent, tasksPercent, performanceScore }
 */
const calculatePerformance = (user, attendances, tasks) => {
    // 1. Attendance Percentage
    const totalDays = attendances.length || 1;
    const presentDays = attendances.filter(a => a.status === 'present');
    const attendancePercent = attendances.length === 0 ? 0 : Math.round((presentDays.length / totalDays) * 100);

    // 2. Tasks Percentage
    const completedTasks = tasks.filter(t => t.status === 'Completed' || t.status === 'Done').length;
    const tasksPercent = tasks.length === 0 ? 100 : Math.round((completedTasks / tasks.length) * 100);

    // 3. Punctuality Percentage
    let punctualDaysCount = 0;
    const userTimings = user.timings || [];

    presentDays.forEach(att => {
        let isLate = false;
        
        // Helper to check if a single clockIn is late
        const checkLate = (clockInDate, expectedTimeStr) => {
            if (!clockInDate || !expectedTimeStr) return false;
            // Create moment object for expected time on the attendance date
            const expectedMoment = moment(`${att.date} ${expectedTimeStr}`, 'YYYY-MM-DD HH:mm');
            // Grace period of 5 minutes
            expectedMoment.add(5, 'minutes');
            
            // Compare clockIn time with expected time
            return moment(clockInDate).isAfter(expectedMoment);
        };

        if (att.shifts && att.shifts.length > 0) {
            // New multi-shift logic
            for (const shift of att.shifts) {
                const sIdx = shift.shiftIndex || 0;
                const expectedStart = userTimings[sIdx] ? userTimings[sIdx].startTime : null;
                if (checkLate(shift.clockIn, expectedStart)) {
                    isLate = true;
                    break;
                }
            }
        } else if (att.clockIn) {
            // Legacy single-shift logic
            const expectedStart = userTimings[0] ? userTimings[0].startTime : null;
            if (checkLate(att.clockIn, expectedStart)) {
                isLate = true;
            }
        }

        if (!isLate) {
            punctualDaysCount++;
        }
    });

    const punctualityPercent = presentDays.length === 0 ? 0 : Math.round((punctualDaysCount / presentDays.length) * 100);

    // 4. Overall Score
    const performanceScore = Math.round((attendancePercent + punctualityPercent + tasksPercent) / 3);

    return {
        attendancePercent,
        punctualityPercent,
        tasksPercent,
        performanceScore
    };
};

module.exports = { calculatePerformance };
