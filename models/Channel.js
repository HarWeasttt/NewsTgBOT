const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
    title: String,
    channelId: String, // Это ID канала в Telegram
    username: String, // username канала (если есть)
    owner: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    settings: {
        mode: { type: String, enum: ['rss', 'ai', 'combined'], default: 'rss' },
        autoPublish: { type: Boolean, default: true },
        schedule: {
            enabled: { type: Boolean, default: false },
            times: [{ type: String }],
            interval: { type: Number, default: 60 },
            lastRun: Date
        },
        postSettings: {
            includeImages: { type: Boolean, default: true },
            maxLength: { type: Number, default: 4000 },
            addHashtags: { type: Boolean, default: true },
            watermark: { type: String, default: '' },
            parseMode: { type: String, enum: ['HTML', 'Markdown'], default: 'HTML' }
        }
    },
    rssSources: [{
        url: String,
        includeKeywords: [String],
        excludeKeywords: [String],
        lastProcessed: Date,
        isActive: { type: Boolean, default: true }
    }],
    aiSettings: {
        tone: { type: String, default: 'professional' },
        topics: [String],
        style: { type: String, default: 'news' },
        customInstructions: String
    },
    statistics: {
        totalPosts: { type: Number, default: 0 },
        lastPostDate: Date,
        postsToday: { type: Number, default: 0 }
    },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Автоматическое обновление updatedAt
channelSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});
// Добавляем middleware для установки значений по умолчанию
// models/Channel.js - обновите middleware
channelSchema.pre('save', function(next) {
  // Гарантируем что settings существует
  if (!this.settings) {
    this.settings = {
      mode: 'combined',
      autoPublish: true,
      schedule: {
        enabled: false,
        times: []
      },
      postSettings: {
        includeImages: true,
        maxLength: 4000,
        addHashtags: true,
        watermark: '',
        parseMode: 'HTML'
      }
    };
  }
  
  // Гарантируем что schedule внутри settings существует
  if (!this.settings.schedule) {
    this.settings.schedule = {
      enabled: false,
      times: []
    };
  }
  
  // Гарантируем что times всегда будет массивом
  if (!Array.isArray(this.settings.schedule.times)) {
    this.settings.schedule.times = [];
  }
  
  // Гарантируем что postSettings существует
  if (!this.settings.postSettings) {
    this.settings.postSettings = {
      includeImages: true,
      maxLength: 4000,
      addHashtags: true,
      watermark: '',
      parseMode: 'HTML'
    };
  }
  
  this.updatedAt = Date.now();
  next();
});
module.exports = mongoose.model('Channel', channelSchema);