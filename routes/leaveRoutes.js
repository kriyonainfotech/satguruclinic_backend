const express = require('express');
const router = express.Router();
const moment = require('moment');
const mongoose = require('mongoose');
const Leave = require('../models/Leave');
const auth = require('../middleware/authMiddleware');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'You do not have permission to do this' });

const USER_FIELDS = 'name role category';
const populateLeave = (q) => q.populate('user', USER_FIELDS).populate('actionBy', 'name role');

// "02:30 PM" -> minutes (galat ho to null)
const timeToMinutes = (val) => {
    const m = String(val || '').trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    if (!m) return null;
    let h = parseInt(m[1], 10) % 12;
    if (m[3] === 'PM') h += 12;
    return h * 60 + parseInt(m[2], 10);
};

// Kisi date pe leave ka time (null = pura din)
const getTimeForDate = (leave, date) => {
    const t = (leave.dayTimes || []).find(d => d.date === date);
    if (t) return t;
    if (leave.fromTime && leave.toTime) return { fromTime: leave.fromTime, toTime: leave.toTime };
    return null;
};

// Do leaves ke common dino me se kisi din takra rahi hain ya nahi.
// Kisi ek ka us din pura din ho to clash, dono me time ho to time overlap dekho.
const leavesClash = (a, b) => {
    const start = a.startDate > b.startDate ? a.startDate : b.startDate;
    const end = a.endDate < b.endDate ? a.endDate : b.endDate;
    for (let d = moment(start); d.format('YYYY-MM-DD') <= end; d.add(1, 'days')) {
        const date = d.format('YYYY-MM-DD');
        const ta = getTimeForDate(a, date);
        const tb = getTimeForDate(b, date);
        if (!ta || !tb) return true;
        if (timeToMinutes(ta.fromTime) < timeToMinutes(tb.toTime) && timeToMinutes(tb.fromTime) < timeToMinutes(ta.toTime)) return true;
    }
    return false;
};

// 1. Calendar ke liye saari approved leaves (sabko dikhti hain)
router.get('/calendar', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'holidays'))) return denied(res);
        const leaves = await populateLeave(Leave.find({ status: 'Approved' })).sort({ startDate: 1 });
        res.json(leaves);
    } catch (error) {
        console.error('Error fetching calendar leaves:', error);
        res.status(500).json({ message: 'Failed to fetch leaves' });
    }
});

// 2. Meri leaves + (approve permission ho to) baaki sabki requests
router.get('/', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'leaves'))) return denied(res);
        const canApprove = await hasPermission(req.user, 'leaves:approve');

        const myLeaves = await populateLeave(Leave.find({ user: req.user.userId })).sort({ createdAt: -1 });
        let requests = [];
        if (canApprove) {
            requests = await populateLeave(Leave.find({ user: { $ne: req.user.userId } })).sort({ createdAt: -1 }).limit(200);
        }
        res.json({ myLeaves, requests, canApprove });
    } catch (error) {
        console.error('Error fetching leaves:', error);
        res.status(500).json({ message: 'Failed to fetch leaves' });
    }
});

// 2b. In dates pe aur kaun leave pe hai (approved + pending), leave lagate / approve karte waqt note ke liye.
// exclude = jis leave ko dekh rahe hain (approve popup), wo aur uska user list me nahi aate
router.get('/overlap', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'leaves'))) return denied(res);
        const { start } = req.query;
        const end = req.query.end || start;
        if (!moment(start, 'YYYY-MM-DD', true).isValid() || !moment(end, 'YYYY-MM-DD', true).isValid() || end < start) {
            return res.status(400).json({ message: 'Invalid dates' });
        }

        // Kiska leave nahi dikhana: apply karte waqt khud ka, approve popup me us request wale ka
        let skipUser = req.user.userId;
        let skipLeave = null;
        if (req.query.exclude && mongoose.Types.ObjectId.isValid(req.query.exclude)) {
            const viewing = await Leave.findById(req.query.exclude).select('user');
            if (viewing) {
                skipUser = String(viewing.user);
                skipLeave = viewing._id;
            }
        }

        const query = {
            status: { $in: ['Approved', 'Pending'] },
            user: { $ne: skipUser },
            startDate: { $lte: end },
            endDate: { $gte: start }
        };
        if (skipLeave) query._id = { $ne: skipLeave };
        const leaves = await Leave.find(query).populate('user', USER_FIELDS).sort({ startDate: 1 });
        res.json(leaves);
    } catch (error) {
        console.error('Error fetching overlapping leaves:', error);
        res.status(500).json({ message: 'Failed to fetch leaves' });
    }
});

// 3. Leave apply karo (superadmin ki leave direct approved)
router.post('/', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'leaves:apply'))) return denied(res);

        const { leaveType, startDate, reason } = req.body;
        const endDate = req.body.endDate || startDate;
        if (!startDate || !moment(startDate, 'YYYY-MM-DD', true).isValid()) {
            return res.status(400).json({ message: 'Please select a valid start date' });
        }
        if (!moment(endDate, 'YYYY-MM-DD', true).isValid() || endDate < startDate) {
            return res.status(400).json({ message: 'End date cannot be before start date' });
        }

        // Har din ka time optional hai. Jis din ka time nahi diya wo pure din ki leave.
        const dayTimes = [];
        for (const t of (Array.isArray(req.body.dayTimes) ? req.body.dayTimes : [])) {
            if (!t || !t.date || t.date < startDate || t.date > endDate) continue;
            if (dayTimes.some(d => d.date === t.date)) continue;
            const from = timeToMinutes(t.fromTime);
            const to = timeToMinutes(t.toTime);
            const label = moment(t.date).format('MMM D');
            if (from === null || to === null) {
                return res.status(400).json({ message: `Please select both From and To time for ${label}` });
            }
            if (to <= from) {
                return res.status(400).json({ message: `To time must be after From time for ${label}` });
            }
            dayTimes.push({ date: t.date, fromTime: t.fromTime, toTime: t.toTime });
        }
        dayTimes.sort((a, b) => a.date.localeCompare(b.date));

        // Same dates/time par pehle se pending/approved leave ho to dobara nahi
        const sameDates = await Leave.find({
            user: req.user.userId,
            status: { $in: ['Pending', 'Approved'] },
            startDate: { $lte: endDate },
            endDate: { $gte: startDate }
        });
        if (sameDates.some(l => leavesClash(l, { startDate, endDate, dayTimes }))) {
            return res.status(400).json({ message: 'You already have a leave on these dates/time' });
        }

        const isSuperadmin = req.user.role === 'superadmin';
        const leave = new Leave({
            user: req.user.userId,
            leaveType: leaveType || 'Casual',
            startDate,
            endDate,
            dayTimes,
            reason: (reason || '').trim(),
            status: isSuperadmin ? 'Approved' : 'Pending',
            actionBy: isSuperadmin ? req.user.userId : null,
            actionAt: isSuperadmin ? new Date() : null
        });
        await leave.save();
        res.json({ message: isSuperadmin ? 'Leave added' : 'Leave request sent for approval', leave });
    } catch (error) {
        console.error('Error applying leave:', error);
        res.status(500).json({ message: 'Failed to apply leave' });
    }
});

// 4. Approve / Reject (khud ki leave khud approve nahi kar sakte)
router.put('/:id/status', auth, async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'leaves:approve'))) return denied(res);

        const { status, note } = req.body;
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }
        const leave = await Leave.findById(req.params.id);
        if (!leave) return res.status(404).json({ message: 'Leave not found' });
        if (String(leave.user) === req.user.userId) {
            return res.status(403).json({ message: 'You cannot approve your own leave' });
        }

        leave.status = status;
        leave.actionBy = req.user.userId;
        leave.actionAt = new Date();
        leave.actionNote = (note || '').trim();
        await leave.save();
        res.json({ message: `Leave ${status.toLowerCase()}`, leave: await populateLeave(Leave.findById(leave._id)) });
    } catch (error) {
        console.error('Error updating leave status:', error);
        res.status(500).json({ message: 'Failed to update leave' });
    }
});

// 5. Delete: apni pending leave (ya superadmin ki apni koi bhi), approver kisi ki bhi
router.delete('/:id', auth, async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);
        if (!leave) return res.status(404).json({ message: 'Leave not found' });

        const isOwner = String(leave.user) === req.user.userId;
        const canApprove = await hasPermission(req.user, 'leaves:approve');
        const ownerCanDelete = isOwner && (leave.status === 'Pending' || req.user.role === 'superadmin');
        if (!ownerCanDelete && !(canApprove && !isOwner)) return denied(res);

        await leave.deleteOne();
        res.json({ message: 'Leave deleted' });
    } catch (error) {
        console.error('Error deleting leave:', error);
        res.status(500).json({ message: 'Failed to delete leave' });
    }
});

module.exports = router;
