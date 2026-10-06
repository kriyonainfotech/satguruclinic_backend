const { google } = require('googleapis');
const User = require('../models/User');
const Task = require('../models/Task');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

exports.getAuthUrl = (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to always get a refresh token
    state: req.user.userId // Pass user ID to callback
  });
  res.json({ url });
};

exports.oauthCallback = async (req, res) => {
  const { code, state: userId } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    await User.findByIdAndUpdate(userId, { googleCalendarTokens: tokens });
    res.redirect('http://localhost:5173/superadmin/schedule-management?sync=success');
  } catch (error) {
    console.error('Error in OAuth Callback:', error);
    res.redirect('http://localhost:5173/superadmin/schedule-management?sync=error');
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
        if (!user || !user.googleCalendarTokens) {
            return res.status(401).json({ message: 'Google Calendar not synced' });
        }
        
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
        
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.json(response.data.items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createEvent = async (req, res) => {
    try {
        const { summary, description, startDateTime, endDateTime, type } = req.body;
        const user = await User.findById(req.user.userId);
        
        // If it's a "Task", we also save it in our CRM DB
        if (type === 'Task') {
             const newTask = new Task({
                 title: summary,
                 description: description,
                 dueDate: new Date(startDateTime),
                 assignedTo: user._id,
                 assignedBy: user._id,
                 priority: 'Medium',
                 status: 'Pending'
             });
             await newTask.save();
        }

        if (user && user.googleCalendarTokens) {
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
            
            await calendar.events.insert({
                calendarId: 'primary',
                resource: event,
            });
        }
        
        res.json({ message: 'Added successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.disconnect = async (req, res) => {
    try {
        const User = require('../models/User');
        await User.findByIdAndUpdate(req.user.userId, { googleCalendarTokens: null });
        res.json({ message: 'Disconnected successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateEvent = async (req, res) => {
    try {
        const User = require('../models/User');
        const { google } = require('googleapis');
        const { summary, description, startDateTime, endDateTime } = req.body;
        const user = await User.findById(req.user.userId);
        if (!user || !user.googleCalendarTokens) return res.status(401).json({ message: 'Not synced' });
        
        oauth2Client.setCredentials(user.googleCalendarTokens);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        const event = {
            summary,
            description,
            start: { dateTime: startDateTime, timeZone: 'Asia/Kolkata' },
            end: { dateTime: endDateTime, timeZone: 'Asia/Kolkata' },
        };
        
        await calendar.events.update({
            calendarId: 'primary',
            eventId: req.params.eventId,
            resource: event,
        });
        res.json({ message: 'Updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteEvent = async (req, res) => {
    try {
        const User = require('../models/User');
        const { google } = require('googleapis');
        const user = await User.findById(req.user.userId);
        if (!user || !user.googleCalendarTokens) return res.status(401).json({ message: 'Not synced' });
        
        oauth2Client.setCredentials(user.googleCalendarTokens);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        await calendar.events.delete({
            calendarId: 'primary',
            eventId: req.params.eventId,
        });
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
