const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { 
    type: Number, 
    required: true, 
    unique: true 
  },
  firstName: {
    type: String,
    required: true
  },
  username: String,
  isAdmin: { 
    type: Boolean, 
    default: false 
  },
  subscription: {
    type: { 
      type: String, 
      enum: ['trial', 'basic', 'advanced', 'professional'], 
      default: 'trial' 
    },
    expiresAt: { 
      type: Date, 
      default: function() {
        const date = new Date();
        date.setDate(date.getDate() + 7); // Trial period
        return date;
      }
    },
    autoRenew: { 
      type: Boolean, 
      default: false 
    }
  },
  trialUsed: { 
    type: Boolean, 
    default: false 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  lastActivity: { 
    type: Date, 
    default: Date.now 
  }
});

userSchema.methods.hasActiveSubscription = function() {
  return this.subscription.expiresAt > new Date();
};

userSchema.methods.isTrialActive = function() {
  return this.subscription.type === 'trial' && this.hasActiveSubscription();
};

module.exports = mongoose.model('User', userSchema);