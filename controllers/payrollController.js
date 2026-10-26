const CompanyHoliday = require('../models/CompanyHoliday');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Task = require('../models/Task');
const Expense = require('../models/Expense');
const Invoice = require('../models/Invoice');
const Lead = require('../models/Lead');
const moment = require('moment');
const { calculatePerformance } = require('../utils/performanceHelper');
const { hasPermission } = require('../utils/permissions');
const { autoCloseForgottenShifts } = require('../utils/attendanceShifts');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai' });

// Commission given to the team member on the total of every sale they make
const COMMISSION_RATE = 0.05;

// Fixed amount given to a telecaller for every lead they convert (status 'Won')
const LEAD_BONUS = 25;

// Lead conversion bonus sirf telecaller category ke team members ko milta hai
const isTelecaller = (user) => (user?.category || '').trim().toLowerCase() === 'telecaller';

// Converted lead ka credit: jisko lead assigned hai, warna jisne banayi
const getLeadOwnerId = (lead) => (lead.assignedTo || lead.createdBy)?.toString();

// Mahine me convert hui leads (purani Won leads jinka wonAt nahi hai unke liye updatedAt)
const wonLeadsQuery = (start, end) => ({
    status: 'Won',
    $or: [
        { wonAt: { $gte: start, $lte: end } },
        { wonAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
        { wonAt: null, updatedAt: { $gte: start, $lte: end } }
    ]
});

const getCommissionAmount = (invoice) => Math.round((invoice.total || 0) * COMMISSION_RATE);

// Sales made by a user in the given month, with commission status
const buildSalesSummary = (invoices) => {
    const sales = invoices.map(inv => ({
        _id: inv._id,
        date: inv.date || moment(inv.createdAt).format('D MMM YYYY'),
        client: inv.client,
        work: inv.work,
        total: inv.total || 0,
        saleAmount: inv.total || 0,
        commission: inv.commissionAdded ? (inv.commissionAmount || 0) : getCommissionAmount(inv),
        commissionAdded: !!inv.commissionAdded
    }));
    const totalSales = sales.reduce((sum, s) => sum + s.saleAmount, 0);
    const commissionAdded = sales.filter(s => s.commissionAdded).reduce((sum, s) => sum + s.commission, 0);
    const commissionPending = sales.filter(s => !s.commissionAdded).reduce((sum, s) => sum + s.commission, 0);
    return { sales, totalSales, commissionAdded, commissionPending };
};

// Leads converted by a telecaller in the given month, with bonus status
const buildLeadsSummary = (leadDocs) => {
    const leads = leadDocs.map(lead => ({
        _id: lead._id,
        date: moment(lead.wonAt || lead.updatedAt).format('D MMM YYYY'),
        fullName: lead.fullName,
        mobile: lead.mobile,
        source: lead.source,
        status: lead.status,
        bonus: lead.bonusAdded ? (lead.bonusAmount || 0) : LEAD_BONUS,
        bonusAdded: !!lead.bonusAdded
    }));
    const bonusAdded = leads.filter(l => l.bonusAdded).reduce((sum, l) => sum + l.bonus, 0);
    const bonusPending = leads.filter(l => !l.bonusAdded).reduce((sum, l) => sum + l.bonus, 0);
    return { leads, totalLeads: leads.length, bonusAdded, bonusPending };
};

// Shift timings "HH:mm" ya "hh:mm AM/PM" dono format me ho sakti hain
const TIME_FORMATS = ['HH:mm', 'hh:mm A', 'h:mm A', 'hh:mm a', 'h:mm a'];

// Helper to calculate minutes between "HH:mm" strings
const calculateShiftMinutes = (timings, shiftIndex) => {
    if (!timings || timings.length <= shiftIndex) return null;
    const t = timings[shiftIndex];
    if (t.startTime && t.endTime) {
        const start = moment(t.startTime, TIME_FORMATS);
        let end = moment(t.endTime, TIME_FORMATS);
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
            const start = moment(t.startTime, TIME_FORMATS);
            let end = moment(t.endTime, TIME_FORMATS);
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

        // Multi-shift me jinka clock out reh gaya, unki shift end time par band karo (salary sahi bane)
        const timingsByUser = {};
        users.forEach(u => { timingsByUser[u._id.toString()] = u.timings; });
        await Promise.all(attendanceRecords.map(a =>
            autoCloseForgottenShifts(a, timingsByUser[a.userId.toString()]) ? a.save() : null
        ));

        // Sales (invoices with services/packages) made by team members this month
        const monthInvoices = await Invoice.find({
            createdBy: { $exists: true, $ne: null },
            total: { $gt: 0 },
            createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        }).sort({ createdAt: -1 });

        // Leads converted (Won) this month - telecaller conversion bonus
        const monthLeads = await Lead.find(wonLeadsQuery(startDate.toDate(), endDate.toDate())).sort({ wonAt: -1 });

        // Find all salary expenses for this month/year
        const salaryExpenses = await Expense.find({
            category: 'Salary',
            month: month,
            year: year
        });

        let totalPayroll = 0;
        let accruedTillDate = 0;
        let totalPaid = 0;
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
                    officialHolidaysPassed += 1; // Din ginne me holiday poora 1 din (salary ghanton se banti hai)
                }
            });

            // Any day not marked as present or half-day is a leave
            leave = Math.max(0, daysElapsed - present - halfDay - officialHolidaysPassed);

            const salary = user.salary || 0;
            const oneDaySalary = salary / daysInMonth;
            const oneHourSalary = oneDaySalary / standardDailyHours; // Using user's standard working hours
            
            let holidayHours = 0;
            let paidHolidayDays = 0;
            officialHolidays.forEach(h => {
                const hasAttendanceForHoliday = userAttendance.some(a => a.date === h.date && (a.status==='present' || a.status==='half-day'));
                if (h.isPaid && !hasAttendanceForHoliday) {
                    if (moment(h.date).isSameOrBefore(today, 'day')) {
                        holidayHours += (h.isHalfDay ? standardDailyHours / 2 : standardDailyHours);
                        paidHolidayDays += 1;
                    }
                }
            });
            
            const paidHours = totalHoursWorked + holidayHours;
            const salesSummary = buildSalesSummary(
                monthInvoices.filter(inv => inv.createdBy.toString() === user._id.toString())
            );
            const userIsTelecaller = isTelecaller(user);
            const leadsSummary = buildLeadsSummary(
                userIsTelecaller ? monthLeads.filter(lead => getLeadOwnerId(lead) === user._id.toString()) : []
            );
            const attendanceEarned = paidHours * oneHourSalary;
            const earned = attendanceEarned + salesSummary.commissionAdded + leadsSummary.bonusAdded;

            totalPayroll += salary;
            accruedTillDate += earned;

            
            const userTasks = await Task.find({ assignedTo: user._id });
            const completedTasks = userTasks.filter(t => t.status === 'Completed' || t.status === 'Done').length;
            const tasksPercent = userTasks.length ? Math.round((completedTasks / userTasks.length) * 100) : 100;
            const { performanceScore } = calculatePerformance(user, userAttendance, userTasks);

            // Calculate how much has already been paid to this user for this month
            const userSalaryExpenses = salaryExpenses.filter(e => e.employeeId && e.employeeId.toString() === user._id.toString());
            const userPaid = userSalaryExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
            totalPaid += userPaid;

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
                isTelecaller: userIsTelecaller,
                stats: {
                    present,
                    halfDay,
                    leave,
                    totalHoursWorked: Math.round(totalHoursWorked * 100) / 100,
                    paidHolidays: paidHolidayDays
                },
                // Poore din (decimal nahi): Full Day + Half Day + Paid Holiday
                totalDays: present + halfDay + paidHolidayDays,
                daysInMonth,
                earned: Math.round(earned),
                attendanceEarned: Math.round(attendanceEarned),
                salesSummary,
                leadsSummary,
                salary,
                paid: userPaid,
                pendingAmount: Math.max(0, Math.round(earned) - userPaid),
                records: userAttendance
            });
        }));

        res.json({
            summary: {
                totalPayroll,
                workingDays: daysInMonth, // or days excluding sundays if you want
                accruedTillDate: Math.round(accruedTillDate),
                totalPaid: Math.round(totalPaid)
            },
            details: payrollDetails,
            officialHolidays
        });

    } catch (error) {
        console.error('Payroll Error:', error);
        res.status(500).json({ message: 'Error fetching payroll data', error: error.message });
    }
};

exports.disburseSalary = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'payroll:pay'))) return denied(res);
        const { employeeId, amount, month, year, account, notes } = req.body;
        if (!employeeId || !amount || !month || !year) {
            return res.status(400).json({ message: 'Employee, amount, month and year are required' });
        }

        const employee = await User.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        const monthName = moment(`${year}-${month}-01`).format('MMMM');
        const formattedDate = moment().format('D MMM YYYY'); // Matches expense format e.g. "12 Oct 2026"

        const newExpense = new Expense({
            date: formattedDate,
            party: `Salary - ${employee.name} (${monthName} ${year})`,
            amount: Number(amount),
            category: 'Salary',
            account: account || 'Company Bank',
            employeeId: employee._id,
            month: String(month).padStart(2, '0'),
            year: String(year),
            notes: notes || `Salary payment for ${monthName} ${year}`
        });

        const savedExpense = await newExpense.save();
        res.status(201).json({
            message: 'Salary payment recorded in expenses successfully',
            expense: savedExpense
        });
    } catch (error) {
        console.error('Error disbursing salary:', error);
        res.status(500).json({ message: 'Error disbursing salary', error: error.message });
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

        // Multi-shift me jinka clock out reh gaya, unki shift end time par band karo
        await Promise.all(attendanceRecords.map(a =>
            autoCloseForgottenShifts(a, user.timings) ? a.save() : null
        ));

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
                officialHolidaysPassed += 1; // Din ginne me holiday poora 1 din (salary ghanton se banti hai)
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
                    extraPaidDaysFromHolidays += 1;
                }
            }
        });
        
        const paidHours = totalHoursWorked + holidayHours;
        const myInvoices = await Invoice.find({
            createdBy: userId,
            total: { $gt: 0 },
            createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() }
        });
        const salesSummary = buildSalesSummary(myInvoices);
        const userIsTelecaller = isTelecaller(user);
        const myLeads = userIsTelecaller
            ? (await Lead.find(wonLeadsQuery(startDate.toDate(), endDate.toDate()))).filter(lead => getLeadOwnerId(lead) === userId.toString())
            : [];
        const leadsSummary = buildLeadsSummary(myLeads);
        const earned = paidHours * oneHourSalary + salesSummary.commissionAdded + leadsSummary.bonusAdded;

        res.json({
            earned: Math.round(earned),
            salesCommission: salesSummary.commissionAdded,
            totalSales: salesSummary.totalSales,
            leadBonus: leadsSummary.bonusAdded,
            totalLeads: leadsSummary.totalLeads,
            isTelecaller: userIsTelecaller,
            target: salary,
            stats: { present, halfDay, leave, paidHolidays: extraPaidDaysFromHolidays, officialHolidaysPassed },
            progress: salary > 0 ? Math.round((earned / salary) * 100) : 0
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching wallet data', error: error.message });
    }
};

// Add (or remove) the sales commission of an invoice to the seller's salary
exports.toggleSaleCommission = async (req, res) => {
    try {
        const userRole = (req.user?.role || '').toLowerCase();
        if (!['admin', 'superadmin'].includes(userRole)) {
            return res.status(403).json({ message: 'Only admin can add sales commission' });
        }
        if (!(await hasPermission(req.user, 'payroll:incentives'))) return denied(res);

        const invoice = await Invoice.findById(req.params.invoiceId);
        if (!invoice) return res.status(404).json({ message: 'Sale not found' });
        if (!invoice.createdBy) return res.status(400).json({ message: 'This sale is not linked to any team member' });

        const add = req.body.add !== false;
        if (add) {
            invoice.commissionAdded = true;
            invoice.commissionAmount = getCommissionAmount(invoice);
            invoice.commissionAddedAt = new Date();
        } else {
            invoice.commissionAdded = false;
            invoice.commissionAmount = 0;
            invoice.commissionAddedAt = undefined;
        }
        await invoice.save();

        res.json({
            message: add ? 'Commission added to salary' : 'Commission removed from salary',
            invoice
        });
    } catch (error) {
        console.error('Error updating sale commission:', error);
        res.status(500).json({ message: 'Error updating sale commission', error: error.message });
    }
};

// Add (or remove) the lead bonus of a lead to the creator's salary
exports.toggleLeadBonus = async (req, res) => {
    try {
        const userRole = (req.user?.role || '').toLowerCase();
        if (!['admin', 'superadmin'].includes(userRole)) {
            return res.status(403).json({ message: 'Only admin can add lead bonus' });
        }
        if (!(await hasPermission(req.user, 'payroll:incentives'))) return denied(res);

        const lead = await Lead.findById(req.params.leadId);
        if (!lead) return res.status(404).json({ message: 'Lead not found' });
        const ownerId = getLeadOwnerId(lead);
        if (!ownerId) return res.status(400).json({ message: 'This lead is not linked to any team member' });

        const add = req.body.add !== false;
        if (add) {
            if (lead.status !== 'Won') {
                return res.status(400).json({ message: 'Bonus is only given for converted (Won) leads' });
            }
            const owner = await User.findById(ownerId).select('category');
            if (!isTelecaller(owner)) {
                return res.status(400).json({ message: 'Lead conversion bonus is only for telecallers' });
            }
        }
        if (add) {
            lead.bonusAdded = true;
            lead.bonusAmount = LEAD_BONUS;
            lead.bonusAddedAt = new Date();
        } else {
            lead.bonusAdded = false;
            lead.bonusAmount = 0;
            lead.bonusAddedAt = undefined;
        }
        await lead.save();

        res.json({
            message: add ? 'Lead bonus added to salary' : 'Lead bonus removed from salary',
            lead
        });
    } catch (error) {
        console.error('Error updating lead bonus:', error);
        res.status(500).json({ message: 'Error updating lead bonus', error: error.message });
    }
};
