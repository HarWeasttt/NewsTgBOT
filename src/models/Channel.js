const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  telegramId: { 
    type: Number, 
    required: true 
  },
  title: {
    type: String,
    required: true
  },
  username: String,
  owner: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  postTemplate: { 
    type: String, 
    default: '{title}\n\n{summary}\n\n{source_link}' 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  addedAt: { 
    type: Date, 
    default: Date.now 
  }
});

channelSchema.index({ owner: 1 });
channelSchema.index({ telegramId: 1 }, { unique: true });

module.exports = mongoose.model('Channel', channelSchema);