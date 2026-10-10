const CompanyHoliday = require('../models/CompanyHoliday');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Task = require('../models/Task');
const moment = require('moment');
const { calculatePerformance } = require('../utils/performanceHelper');

// Helper to calculate minutes between "HH:mm" strings
const calculateShiftMinutes = (timings, shiftIndex) => {
    if (!timings || timings.length <= shiftIndex) return null;
    const t = timings[shiftIndex];
    if (t.startTime && t.endTime) {
        const start = moment(t.startTime, 'HH:mm');
        let end = moment(t.endTime, 'HH:mm');
        if (end.isBefore(start)) end.add(1, 'days');
        return end.diff(start, 'minutes');
    }
    return null;
};

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
        
        let query = {};
        const userRole = (req.user?.role || '').toLowerCase();
        
        if (userRole === 'admin') {
            query = { adminId: req.user.userId };
        } else if (userRole === 'superadmin') {
            query = { role: { $in: ['admin', 'team'] } };
        } else {
            return res.status(403).json({ message: 'Unauthorized access to payroll' });
        }
        
        const users = await User.find(query).select('-password');
        const attendanceRecords = await Attendance.find({
            date: {
                $gte: startDate.format('YYYY-MM-DD'),
                $lte: endDate.format('YYYY-MM-DD')
            }
        });

        let totalPayroll = 0;
        let accruedTillDate = 0;
        const payrollDetails = [];

        await Promise.all(users.map(async user => {
            const userAttendance = attendanceRecords.filter(a => a.userId.toString() === user._id.toString());
            let present = 0;
            let halfDay = 0;
            let leave = 0;

            let totalHoursWorked = 0;
            const standardDailyHours = calculateScheduledMinutes(user.timings) / 60;

            userAttendance.forEach(a => {
                let currentDayHours = 0;
                let usedFallback = false;

                // Calculate exact hours
                              if (a.shifts && a.shifts.length > 0) {
                  let totalDailyMinutes = 0;
                  a.shifts.forEach(shift => {
                      if (shift.clockIn) {
                          const inTime = moment(shift.clockIn);
                          const outTime = shift.clockOut ? moment(shift.clockOut) : moment();
                          const shiftMinutes = outTime.diff(inTime, 'minutes');
                          let shiftHours = Math.floor(shiftMinutes / 15) * 0.25;
                                                    if (!shift.clockOut) {
                              const shiftScheduledMins = calculateShiftMinutes(user.timings, shift.shiftIndex || 0);
                              const shiftStandardHours = shiftScheduledMins ? shiftScheduledMins / 60 : (standardDailyHours / a.shifts.length);
                              if (shiftHours > shiftStandardHours) {
                                  shiftHours = shiftStandardHours;
                              }
                          }
                          totalDailyMinutes += shiftMinutes;
                      }
                  });
                  let hours = Math.floor(totalDailyMinutes / 15) * 0.25;
                  const anyMissed = a.shifts.some(s => s.clockIn && !s.clockOut);
                  if (anyMissed && hours > standardDailyHours) {
                      hours = standardDailyHours;
                  }
                  if (hours > 0) {
                      currentDayHours = hours;
                      totalHoursWorked += hours;
                  }
              } else if (a.clockIn) {
                  const inTime = moment(a.clockIn);
                  const outTime = a.clockOut ? moment(a.clockOut) : moment();
                  const totalMinutes = outTime.diff(inTime, 'minutes');
                  let hours = Math.floor(totalMinutes / 15) * 0.25;
                  if (!a.clockOut && hours > standardDailyHours) { hours = standardDailyHours; }
                  if (hours > 0) {
                      currentDayHours = hours;
                      totalHoursWorked += hours;
                  }
                } else if (a.status === 'present') {
                    currentDayHours = standardDailyHours;
                    totalHoursWorked += standardDailyHours; // fallback for full day
                    usedFallback = true;
                } else if (a.status === 'half-day') {
                    currentDayHours = standardDailyHours / 2;
                    totalHoursWorked += standardDailyHours / 2; // fallback for half day
                    usedFallback = true;
                }

                // Dynamically update stats based on exact hours if clockOut is done
                if (!usedFallback && currentDayHours > 0) {
                    if (currentDayHours >= standardDailyHours * 0.75) {
                        present++;
                    } else if (currentDayHours >= standardDailyHours * 0.3) {
                        halfDay++;
                    }
                    // if less than 30%, it is considered leave for stats purposes, but hours still paid
                } else {
                    if (a.status === 'present') present++;
                    else if (a.status === 'half-day') halfDay++;
                }
            });
            
            let officialHolidaysPassed = 0;
            officialHolidays.forEach(h => {
                if (moment(h.date).isSameOrBefore(today, 'day')) {
                    officialHolidaysPassed += (h.isHalfDay ? 0.5 : 1);
                }
            });

            // Any day not marked as present or half-day is a leave
            leave = Math.max(0, daysElapsed - present - halfDay - officialHolidaysPassed);

            const salary = user.salary || 0;
            const oneDaySalary = salary / daysInMonth;
            const oneHourSalary = oneDaySalary / standardDailyHours; // Using user's standard working hours
            
            let holidayHours = 0;
            officialHolidays.forEach(h => {
                const hasAttendanceForHoliday = userAttendance.some(a => a.date === h.date && (a.status==='present' || a.status==='half-day'));
                if (h.isPaid && !hasAttendanceForHoliday) {
                    if (moment(h.date).isSameOrBefore(today, 'day')) {
                        holidayHours += (h.isHalfDay ? standardDailyHours / 2 : standardDailyHours);
                    }
                }
            });
            
            const paidHours = totalHoursWorked + holidayHours;
            const earned = paidHours * oneHourSalary;

            totalPayroll += salary;
            accruedTillDate += earned;

            
            const userTasks = await Task.find({ assignedTo: user._id });
            const completedTasks = userTasks.filter(t => t.status === 'Completed' || t.status === 'Done').length;
            const tasksPercent = userTasks.length ? Math.round((completedTasks / userTasks.length) * 100) : 100;
            const { performanceScore } = calculatePerformance(user, userAttendance, userTasks);

            payrollDetails.push({
                user: {
                      performanceScore,
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
                    totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
                    paidHolidays: holidayHours / standardDailyHours
                },
                totalDays: Math.round((paidHours / standardDailyHours) * 100) / 100,
                daysInMonth,
                earned: Math.round(earned),
                salary,
                records: userAttendance
            });
        }));

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

        let totalHoursWorked = 0;
        const standardDailyHours = calculateScheduledMinutes(user.timings) / 60;

        attendanceRecords.forEach(a => {
            let currentDayHours = 0;
            let usedFallback = false;
            
                          if (a.shifts && a.shifts.length > 0) {
                  let totalDailyMinutes = 0;
                  a.shifts.forEach(shift => {
                      if (shift.clockIn) {
                          const inTime = moment(shift.clockIn);
                          const outTime = shift.clockOut ? moment(shift.clockOut) : moment();
                          const shiftMinutes = outTime.diff(inTime, 'minutes');
                          let shiftHours = Math.floor(shiftMinutes / 15) * 0.25;
                                                    if (!shift.clockOut) {
                              const shiftScheduledMins = calculateShiftMinutes(user.timings, shift.shiftIndex || 0);
                              const shiftStandardHours = shiftScheduledMins ? shiftScheduledMins / 60 : (standardDailyHours / a.shifts.length);
                              if (shiftHours > shiftStandardHours) {
                                  shiftHours = shiftStandardHours;
                              }
                          }
                          totalDailyMinutes += shiftMinutes;
                      }
                  });
                  let hours = Math.floor(totalDailyMinutes / 15) * 0.25;
                  const anyMissed = a.shifts.some(s => s.clockIn && !s.clockOut);
                  if (anyMissed && hours > standardDailyHours) {
                      hours = standardDailyHours;
                  }
                  if (hours > 0) {
                      currentDayHours = hours;
                      totalHoursWorked += hours;
                  }
              } else if (a.clockIn) {
                  const inTime = moment(a.clockIn);
                  const outTime = a.clockOut ? moment(a.clockOut) : moment();
                  const totalMinutes = outTime.diff(inTime, 'minutes');
                  let hours = Math.floor(totalMinutes / 15) * 0.25;
                  if (!a.clockOut && hours > standardDailyHours) { hours = standardDailyHours; }
                  if (hours > 0) {
                      currentDayHours = hours;
                      totalHoursWorked += hours;
                  }
            } else if (a.status === 'present') {
                currentDayHours = standardDailyHours;
                totalHoursWorked += standardDailyHours;
                usedFallback = true;
            } else if (a.status === 'half-day') {
                currentDayHours = standardDailyHours / 2;
                totalHoursWorked += standardDailyHours / 2;
                usedFallback = true;
            }

            if (!usedFallback && currentDayHours > 0) {
                if (currentDayHours >= standardDailyHours * 0.75) {
                    present++;
                } else if (currentDayHours >= standardDailyHours * 0.3) {
                    halfDay++;
                }
            } else {
                if (a.status === 'present') present++;
                else if (a.status === 'half-day') halfDay++;
            }
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
        const oneHourSalary = oneDaySalary / standardDailyHours;
        
        let holidayHours = 0;
        let extraPaidDaysFromHolidays = 0;
        officialHolidays.forEach(h => {
            const hasAttendanceForHoliday = attendanceRecords.some(a => a.date === h.date && (a.status==='present' || a.status==='half-day'));
            if (h.isPaid && !hasAttendanceForHoliday) {
                if (moment(h.date).isSameOrBefore(today, 'day')) {
                    holidayHours += (h.isHalfDay ? standardDailyHours / 2 : standardDailyHours);
                    extraPaidDaysFromHolidays += (h.isHalfDay ? 0.5 : 1);
                }
            }
        });
        
        const paidHours = totalHoursWorked + holidayHours;
        const earned = paidHours * oneHourSalary;

        res.json({
            earned: Math.round(earned),
            target: salary,
            stats: { present, halfDay, leave, paidHolidays: extraPaidDaysFromHolidays, officialHolidaysPassed },
            progress: salary > 0 ? Math.round((earned / salary) * 100) : 0
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching wallet data', error: error.message });
    }
};




