const express = require('express');
const router = express.Router();
const ical = require('node-ical');
const CompanyHoliday = require('../models/CompanyHoliday');
const auth = require('../middleware/authMiddleware');
const moment = require('moment');

// 1. Get all holidays (Merged Google iCal + DB Status)
router.get('/', async (req, res) => {
    try {
        const url = 'https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics';
        let events = {};
        try {
            events = await ical.async.fromURL(url);
        } catch (e) {
            console.error("Could not fetch iCal, continuing with DB only", e);
        }
        
        const customHolidays = await CompanyHoliday.find({});
        const customHolidaysMap = {};
        customHolidays.forEach(h => {
            if (!customHolidaysMap[h.date]) {
                customHolidaysMap[h.date] = [];
            }
            customHolidaysMap[h.date].push(h);
        });

        let holidays = [];
        const processedGoogleDates = new Set();

        for (const event of Object.values(events)) {
            if (event.type === 'VEVENT') {
                const dateStr = moment(event.start).format('YYYY-MM-DD');
                
                // If there's a matching DB record for this specific google event title, use it.
                // Otherwise use default false.
                let isOfficial = false;
                let isPaid = false;
                
                if (customHolidaysMap[dateStr]) {
                    const match = customHolidaysMap[dateStr].find(c => c.title === event.summary);
                    if (match) {
                        isOfficial = match.isOfficial;
                        isPaid = match.isPaid;
                        match.matched = true; // Mark as processed
                    }
                }
                
                holidays.push({
                    title: event.summary,
                    date: event.start,
                    dateStr: dateStr,
                    id: event.uid,
                    isOfficial,
                    isPaid,
                    isCustom: false
                });
                
                processedGoogleDates.add(dateStr);
            }
        }
        
        // Now add all custom holidays that didn't match a Google event
        customHolidays.forEach(h => {
            if (!h.matched && h.isOfficial) {
                holidays.push({
                    title: h.title,
                    date: new Date(h.date),
                    dateStr: h.date,
                    id: h._id.toString(),
                    isOfficial: h.isOfficial,
                    isPaid: h.isPaid,
                    isHalfDay: h.isHalfDay || false,
                    isCustom: true
                });
            }
        });
        
        holidays.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        res.json(holidays);
    } catch (error) {
        console.error('Error fetching holidays:', error);
        res.status(500).json({ message: 'Failed to fetch holidays' });
    }
});

// 2. Save or Update a Holiday Setting (SuperAdmin/Admin only)
router.post('/toggle', auth, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { dateStr, title, isOfficial, isPaid } = req.body;

        let holiday = await CompanyHoliday.findOne({ date: dateStr, title: title });
        if (holiday) {
            holiday.isOfficial = isOfficial;
            holiday.isPaid = isPaid;
            await holiday.save();
        } else {
            holiday = new CompanyHoliday({
                date: dateStr,
                title,
                isOfficial,
                isPaid
            });
            await holiday.save();
        }

        res.json({ message: 'Holiday settings updated', holiday });
    } catch (error) {
        console.error('Error saving holiday:', error);
        res.status(500).json({ message: 'Failed to save holiday settings' });
    }
});

// 3. Save Custom Holiday Range
router.post('/custom', auth, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { title, startDate, endDate, isPaid, isHalfDay } = req.body;
        
        const start = moment(startDate);
        const end = moment(endDate);
        
        if (end.isBefore(start)) {
            return res.status(400).json({ message: 'End date cannot be before start date' });
        }
        
        const createdHolidays = [];
        let curr = start.clone();
        
        while (curr.isSameOrBefore(end)) {
            const dateStr = curr.format('YYYY-MM-DD');
            let holiday = await CompanyHoliday.findOne({ date: dateStr, title: title });
            if (holiday) {
                holiday.isOfficial = true;
                holiday.isPaid = isPaid;
                // Save isHalfDay if we modify schema, but we can just use dynamic for now
                // Actually let's add it via strict false on save if not in schema, but mongoose allows mixed or we can update schema later.
                holiday.set('isHalfDay', isHalfDay, { strict: false });
                await holiday.save();
            } else {
                holiday = new CompanyHoliday({
                    date: dateStr,
                    title,
                    isOfficial: true,
                    isPaid
                });
                holiday.set('isHalfDay', isHalfDay, { strict: false });
                await holiday.save();
            }
            createdHolidays.push(holiday);
            curr.add(1, 'days');
        }

        res.json({ message: 'Custom holidays added', createdHolidays });
    } catch (error) {
        console.error('Error saving custom holidays:', error);
        res.status(500).json({ message: 'Failed to save custom holidays' });
    }
});

// 4. Get Upcoming Official Holidays for Dashboard
router.get('/upcoming', auth, async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const nextWeek = moment().add(15, 'days').format('YYYY-MM-DD');
        
        const upcoming = await CompanyHoliday.find({
            isOfficial: true,
            date: { $gte: today, $lte: nextWeek }
        }).sort({ date: 1 });

        res.json(upcoming);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch upcoming holidays' });
    }
});


// 5. Delete Custom Holiday
router.delete('/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }
        await CompanyHoliday.findByIdAndDelete(req.params.id);
        res.json({ message: 'Holiday deleted successfully' });
    } catch (error) {
        console.error('Error deleting holiday:', error);
        res.status(500).json({ message: 'Failed to delete holiday' });
    }
});

module.exports = router;

