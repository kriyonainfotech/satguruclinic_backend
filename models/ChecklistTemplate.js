const mongoose = require('mongoose');

const checklistTemplateSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  items: [{
    text: String
  }],
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }
}, { timestamps: true });

module.exports = mongoose.model('ChecklistTemplate', checklistTemplateSchema);
