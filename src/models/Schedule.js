const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  prompt: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Prompt', 
    required: true 
  },
  channel: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Channel', 
    required: true 
  },
  postsPerDay: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  daysOfWeek: [{
    type: Number,
    min: 0,
    max: 6
  }],
  timeSlots: {
    type: { 
      type: String, 
      enum: ['interval', 'exact'], 
      default: 'interval' 
    },
    from: String,
    to: String,
    exactTimes: [String]
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  lastPosted: Date
});

scheduleSchema.index({ prompt: 1, channel: 1 }, { unique: true });
scheduleSchema.index({ isActive: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);