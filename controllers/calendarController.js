const { google } = require('googleapis');
const mongoose = require('mongoose');
const User = require('../models/User');
const Task = require('../models/Task');
const CalendarEvent = require('../models/CalendarEvent');
const { hasPermission } = require('../utils/permissions');

const denied = (res) => res.status(403).json({ message: 'Aapko ye karne ki permission nahi hai', error: 'Aapko ye karne ki permission nahi hai' });

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

exports.getAuthUrl = async (req, res) => {
  try {
    if (!(await hasPermission(req.user, 'schedule-management:google-sync'))) return denied(res);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force consent screen to always get a refresh token
      state: req.user.userId // Pass user ID to callback
    });
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.oauthCallback = async (req, res) => {
  const { code, state: userId } = req.query;
  const frontendBase = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://satguruclinic-frontend.vercel.app' : 'http://localhost:5173');
  try {
    const { tokens } = await oauth2Client.getToken(code);
    await User.findByIdAndUpdate(userId, { googleCalendarTokens: tokens });
    res.redirect(`${frontendBase}/superadmin/schedule-management?sync=success`);
  } catch (error) {
    console.error('Error in OAuth Callback:', error);
    res.redirect(`${frontendBase}/superadmin/schedule-management?sync=error`);
  }
};

exports.checkSyncStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (user && user.googleCalendarTokens) {
            return res.json({ isSynced: true });
        }
        res.json({ isSynced: false });
    } catch (error) {
        console.error("CALENDAR ERROR:", error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
};

exports.getEvents = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        const dbEvents = await CalendarEvent.find({ user: req.user.userId }).sort({ startDateTime: 1 });
        
        let formattedDbEvents = dbEvents.map(e => ({
            id: e._id.toString(),
            summary: e.summary,
            description: e.description || '',
            start: { dateTime: e.startDateTime ? e.startDateTime.toISOString() : null },
            end: { dateTime: e.endDateTime ? e.endDateTime.toISOString() : null }
        }));

        if (!user || !user.googleCalendarTokens) {
            // Google Calendar not synced - return DB events directly
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.json(formattedDbEvents);
        }
        
        try {
            oauth2Client.setCredentials(user.googleCalendarTokens);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            
            const pastDate = new Date();
            pastDate.setMonth(pastDate.getMonth() - 6); // Fetch from 6 months ago
            const response = await calendar.events.list({
                calendarId: 'primary',
                timeMin: pastDate.toISOString(),
                maxResults: 2500,
                singleEvents: true,
                orderBy: 'startTime',
            });
            
            const googleEvents = response.data.items || [];
            
            // Merge events: avoid duplicating if googleEventId matches
            const googleIds = new Set(googleEvents.map(g => g.id));
            const uniqueDbEvents = formattedDbEvents.filter(d => {
                const matchedInDb = dbEvents.find(e => e._id.toString() === d.id);
                return !matchedInDb || !matchedInDb.googleEventId || !googleIds.has(matchedInDb.googleEventId);
            });

            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.json([...googleEvents, ...uniqueDbEvents]);
        } catch (gErr) {
            console.error('Google Calendar list error, falling back to DB events:', gErr.message);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            return res.json(formattedDbEvents);
        }
    } catch (error) {
        console.error('getEvents error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.createEvent = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'schedule-management:create'))) return denied(res);
        const { summary, description, startDateTime, endDateTime, type } = req.body;
        const user = await User.findById(req.user.userId);
        
        // 1. Save in CalendarEvent DB model
        const newCalEvent = new CalendarEvent({
            user: req.user.userId,
            summary: summary || 'Untitled Event',
            title: summary ? summary.replace(/\[(Meeting|Task|Event)\]\s*/, '') : '',
            description: description || '',
            type: type || 'Meeting',
            startDateTime: new Date(startDateTime),
            endDateTime: new Date(endDateTime)
        });

        // 2. If it's a "Task", also save it in our CRM Task DB
        if (type === 'Task') {
             const newTask = new Task({
                 title: summary,
                 description: description,
                 dueDate: new Date(startDateTime),
                 assignedTo: req.user.userId,
                 assignedBy: req.user.userId,
                 priority: 'Medium',
                 status: 'Pending'
             });
             await newTask.save();
        }

        // 3. If Google Calendar is synced, push to Google Calendar
        if (user && user.googleCalendarTokens) {
            try {
                oauth2Client.setCredentials(user.googleCalendarTokens);
                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
                
                const event = {
                    summary,
                    description,
                    start: {
                        dateTime: startDateTime,
                        timeZone: 'Asia/Kolkata',
                    },
                    end: {
                        dateTime: endDateTime,
                        timeZone: 'Asia/Kolkata',
                    },
                };
                
                const gRes = await calendar.events.insert({
                    calendarId: 'primary',
                    resource: event,
                });
                if (gRes?.data?.id) {
                    newCalEvent.googleEventId = gRes.data.id;
                }
            } catch (gErr) {
                console.error('Google Calendar event insert failed, saved to DB only:', gErr.message);
            }
        }

        await newCalEvent.save();
        res.json({ message: 'Added successfully', event: newCalEvent });
    } catch (error) {
        console.error('createEvent error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.disconnect = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'schedule-management:google-sync'))) return denied(res);
        await User.findByIdAndUpdate(req.user.userId, { googleCalendarTokens: null });
        res.json({ message: 'Disconnected successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateEvent = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'schedule-management:edit'))) return denied(res);
        const { summary, description, startDateTime, endDateTime } = req.body;
        const user = await User.findById(req.user.userId);
        
        let calEvent = null;
        if (mongoose.Types.ObjectId.isValid(req.params.eventId)) {
            calEvent = await CalendarEvent.findOne({ _id: req.params.eventId, user: req.user.userId });
            if (calEvent) {
                calEvent.summary = summary;
                calEvent.description = description;
                calEvent.startDateTime = new Date(startDateTime);
                calEvent.endDateTime = new Date(endDateTime);
                await calEvent.save();
            }
        }

        // If Google Calendar synced, update in Google Calendar
        if (user && user.googleCalendarTokens) {
            try {
                oauth2Client.setCredentials(user.googleCalendarTokens);
                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
                
                const event = {
                    summary,
                    description,
                    start: { dateTime: startDateTime, timeZone: 'Asia/Kolkata' },
                    end: { dateTime: endDateTime, timeZone: 'Asia/Kolkata' },
                };
                
                const gEventId = calEvent?.googleEventId || req.params.eventId;
                await calendar.events.update({
                    calendarId: 'primary',
                    eventId: gEventId,
                    resource: event,
                });
            } catch (gErr) {
                console.error('Google event update failed:', gErr.message);
            }
        }
        res.json({ message: 'Updated successfully' });
    } catch (error) {
        console.error('updateEvent error:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        if (!(await hasPermission(req.user, 'schedule-management:delete'))) return denied(res);
        const user = await User.findById(req.user.userId);
        let calEvent = null;
        if (mongoose.Types.ObjectId.isValid(req.params.eventId)) {
            calEvent = await CalendarEvent.findOneAndDelete({ _id: req.params.eventId, user: req.user.userId });
        }

        if (user && user.googleCalendarTokens) {
            try {
                oauth2Client.setCredentials(user.googleCalendarTokens);
                const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
                const gEventId = calEvent?.googleEventId || req.params.eventId;
                await calendar.events.delete({
                    calendarId: 'primary',
                    eventId: gEventId,
                });
            } catch (gErr) {
                console.error('Google event delete failed:', gErr.message);
            }
        }
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        console.error('deleteEvent error:', error);
        res.status(500).json({ error: error.message });
    }
};
