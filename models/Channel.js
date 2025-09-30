const mongoose = require('mongoose');

const ChannelSchema = new mongoose.Schema({
  telegramId: { type: String, required: true },
  title: { type: String, required: true },
  username: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  settings: {
    mode: { type: String, enum: ['rss', 'ai', 'combined'], default: 'combined' },
    autoPublish: { type: Boolean, default: true },
    schedule: {
      enabled: { type: Boolean, default: false },
      times: [{ type: String }] // Формат: "HH:MM"
    }
  },
  rssSources: [{
    url: { type: String, required: true },
    includeKeywords: [{ type: String }],
    excludeKeywords: [{ type: String }],
    lastItemUrl: String,
    isActive: { type: Boolean, default: true }
  }],
  aiSettings: {
    topics: [{ type: String }],
    tone: { type: String, default: 'professional' },
    style: { type: String, default: 'news' }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Channel', ChannelSchema);