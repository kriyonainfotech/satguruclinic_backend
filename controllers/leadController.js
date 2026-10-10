const Lead = require('../models/Lead');
const User = require('../models/User');

const createLead = async (req, res) => {
    try {
        const { fullName, email, mobile, status, source, assignedTo, date, nextFollowUp, birthdate } = req.body;
        const createdBy = req.user.userId;
        
        const creator = await User.findById(createdBy);
        if (!creator) {
            return res.status(404).json({ message: 'User not found' });
        }

        let adminId;
        if (creator.role === 'admin') {
            adminId = creator._id;
        } else if (creator.role === 'team' && creator.adminId) {
            adminId = creator.adminId;
        } else {
            adminId = creator._id;
        }

        let finalAssignedTo = assignedTo || (creator.role === 'team' ? createdBy : null);
        
        // If assignedTo is provided, update adminId based on assignee's hierarchy
        if (finalAssignedTo) {
            const assignee = await User.findById(finalAssignedTo);
            if (assignee) {
                if (assignee.role === 'admin') {
                    adminId = assignee._id;
                } else if (assignee.role === 'team' && assignee.adminId) {
                    adminId = assignee.adminId;
                }
            }
        }

        const newLead = new Lead({
            fullName,
            email,
            mobile,
            status,
            source,
            assignedTo: finalAssignedTo,
            createdBy,
            adminId,
            date,
            nextFollowUp,
            birthdate
        });

        const savedLead = await newLead.save();
        res.status(201).json(savedLead);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

const getLeads = async (req, res) => {
    try {
        let filter = {};
        const userId = req.user.userId;
        const role = req.user.role;
        
        if (role === 'superadmin') {
            filter = {};
        } else if (role === 'admin') {
            filter = { $or: [{ adminId: userId }, { createdBy: userId }, { assignedTo: userId }] };
        } else {
            // Team member
            const currentUser = await User.findById(userId); filter = { adminId: currentUser.adminId };
        }

        const leads = await Lead.find(filter)
            .populate('assignedTo', 'name email')
            .populate('createdBy', 'name email').populate('adminId', 'name');
            
        res.status(200).json(leads);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};


const updateLead = async (req, res) => {
    try {
        if (req.body.assignedTo === '') { req.body.assignedTo = null; }
        
        let updateData = { ...req.body };
        if (updateData.assignedTo) {
            const assignee = await User.findById(updateData.assignedTo);
            if (assignee) {
                if (assignee.role === 'admin') {
                    updateData.adminId = assignee._id;
                } else if (assignee.role === 'team' && assignee.adminId) {
                    updateData.adminId = assignee.adminId;
                }
            }
        }
        delete updateData._id; // Ensure _id is not in payload
        
        const updatedLead = await Lead.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!updatedLead) return res.status(404).json({ message: 'Lead not found', id: req.params.id });
        res.status(200).json(updatedLead);
    } catch (error) {
        console.error('Update lead error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

const deleteLead = async (req, res) => {
    try {
        const deletedLead = await Lead.findByIdAndDelete(req.params.id);
        if (!deletedLead) return res.status(404).json({ message: 'Lead not found' });
        res.status(200).json({ message: 'Lead deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = {
    createLead,
    getLeads,
    updateLead,
    deleteLead
};

const LeadReminder = require('../models/LeadReminder');

module.exports.addReminder = async (req, res) => {
    try {
        const leadId = req.params.id;
        const { type, date, time, nextFollowUpDate, remarks } = req.body;
        const createdBy = req.user.userId;

        const reminder = new LeadReminder({
            lead: leadId,
            type,
            date,
            time,
            nextFollowUpDate,
            remarks,
            createdBy
        });
        await reminder.save();

        if (nextFollowUpDate) {
            await Lead.findByIdAndUpdate(leadId, { nextFollowUp: nextFollowUpDate });
        }

        res.status(201).json(reminder);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports.getLeadReminders = async (req, res) => {
    try {
        const leadId = req.params.id;
        const reminders = await LeadReminder.find({ lead: leadId }).sort({ createdAt: -1 }).populate('createdBy', 'name');
        res.status(200).json(reminders);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports.getTodayReminders = async (req, res) => {
    try {
        const userId = req.user.userId;
        const role = req.user.role;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let filter = { date: { $gte: today, $lt: tomorrow } };
        
        let remindersData = await LeadReminder.find(filter)
            .populate({
                path: 'lead',
                populate: { path: 'assignedTo createdBy adminId' }
            });
            
        let reminders = remindersData.map(r => r.toObject());

        // Fetch leads that have nextFollowUp for today
        let leadFilter = { nextFollowUp: { $gte: today, $lt: tomorrow } };
        let leadsWithFollowup = await Lead.find(leadFilter)
            .populate('assignedTo createdBy adminId');

        const existingLeadIds = reminders.map(r => r.lead && r.lead._id ? r.lead._id.toString() : '');

        leadsWithFollowup.forEach(lead => {
            if (!existingLeadIds.includes(lead._id.toString())) {
                reminders.push({
                    _id: 'auto_' + lead._id.toString(),
                    lead: lead.toObject(),
                    type: 'Phone',
                    date: lead.nextFollowUp,
                    time: '12:00',
                    remarks: 'Scheduled Follow-Up'
                });
            }
        });

        if (role === 'admin') {
            reminders = reminders.filter(r => r.lead && (
                (r.lead.adminId && r.lead.adminId._id.toString() === userId) || 
                (r.lead.createdBy && r.lead.createdBy._id.toString() === userId) ||
                (r.lead.assignedTo && r.lead.assignedTo._id.toString() === userId)
            ));
        } else if (role === 'team') {
            const currentUser = await User.findById(userId);
            reminders = reminders.filter(r => r.lead && r.lead.adminId && r.lead.adminId._id.toString() === currentUser.adminId.toString());
        }

        res.status(200).json(reminders);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports.getLeadById = async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id)
            .populate('assignedTo', 'name email')
            .populate('createdBy', 'name email').populate('adminId', 'name');
        if (!lead) return res.status(404).json({ message: 'Lead not found' });
        res.status(200).json(lead);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};


module.exports.updateReminder = async (req, res) => {
    try {
        const { type, date, time, nextFollowUpDate, remarks } = req.body;
        const reminder = await LeadReminder.findByIdAndUpdate(req.params.reminderId, { type, date, time, nextFollowUpDate, remarks }, { new: true });
        if (!reminder) return res.status(404).json({ message: 'Reminder not found' });
        
        if (nextFollowUpDate) {
            await Lead.findByIdAndUpdate(reminder.lead, { nextFollowUp: nextFollowUpDate });
        }
        res.status(200).json(reminder);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports.deleteReminder = async (req, res) => {
    try {
        const deleted = await LeadReminder.findByIdAndDelete(req.params.reminderId);
        if (!deleted) return res.status(404).json({ message: 'Reminder not found' });
        res.status(200).json({ message: 'Reminder deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};



