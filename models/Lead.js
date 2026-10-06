const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
  },
  mobile: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: 'New',
    enum: ['New', 'In Followup', 'Interested', 'Cold', 'Lost', 'Won'],
  },
  source: {
    type: String,
    enum: ['Reference', 'Instagram', 'WhatsApp', 'LinkedIn', 'Other'],
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  nextFollowUp: {
    type: Date,
  }
}, { timestamps: true });

module.exports = mongoose.model('Lead', leadSchema);
