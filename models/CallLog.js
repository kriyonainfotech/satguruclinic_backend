const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  teamMember: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['Answered', 'DNP', 'Busy', 'Wrong Number', 'Unreachable'], required: true },
  discussion: { type: String, required: true },
  remarks: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('CallLog', callLogSchema);