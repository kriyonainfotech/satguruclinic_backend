const mongoose = require('mongoose');

const leadReminderSchema = new mongoose.Schema({
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true,
  },
  type: {
    type: String,
    enum: ['Phone', 'Email', 'Meeting', 'WhatsApp'],
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  time: {
    type: String,
    required: true,
  },
  nextFollowUpDate: {
    type: Date,
  },
  remarks: {
    type: String,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }
}, { timestamps: true });

module.exports = mongoose.model('LeadReminder', leadReminderSchema);
