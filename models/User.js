const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  username: String,
  firstName: { type: String, required: true },
  lastName: String,
  subscription: {
    plan: { type: String, default: 'FREE' },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date, default: Date.now },
    isTrial: { type: Boolean, default: true },
    trialEndDate: { type: Date, default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
  },
  limits: {
    channels: { type: Number, default: 1 },
    postsToday: { type: Number, default: 0 },
    postsPerDay: { type: Number, default: 1 },
    lastReset: { type: Date, default: Date.now }
  },
  settings: {
    aiTone: { type: String, default: 'professional' },
    language: { type: String, default: 'russian' }
  },
  isBlocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Статический метод для сброса дневных лимитов
UserSchema.statics.resetDailyLimits = async function() {
  const today = new Date().toDateString();
  await this.updateMany(
    { 'limits.lastReset': { $lt: new Date(today) } },
    { 
      $set: { 
        'limits.postsToday': 0,
        'limits.lastReset': new Date()
      }
    }
  );
};

module.exports = mongoose.model('User', UserSchema);