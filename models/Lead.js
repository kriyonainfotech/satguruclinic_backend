const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now
  },
  fullName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
  },
  birthdate: {
    type: Date,
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
  },
  // Lead kab convert (Won) hui - telecaller ka conversion bonus isi mahine me ginta hai
  wonAt: {
    type: Date,
  },
  // Lead bonus: lead convert (Won) karne wale telecaller ko fixed amount payroll me milta hai
  bonusAdded: {
    type: Boolean,
    default: false,
  },
  bonusAmount: {
    type: Number,
    default: 0,
  },
  bonusAddedAt: {
    type: Date,
  }
}, { timestamps: true });

module.exports = mongoose.model('Lead', leadSchema);
