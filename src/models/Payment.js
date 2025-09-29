const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  plan: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'SubscriptionPlan', 
    required: true 
  },
  amount: {
    type: Number,
    required: true
  },
  starsAmount: {
    type: Number,
    required: false
  },
  status: { 
    type: String, 
    enum: ['pending', 'succeeded', 'canceled', 'failed'], 
    default: 'pending' 
  },
  provider: {
    type: String,
    enum: ['yookassa', 'telegram_stars', 'crypto'],
    default: 'telegram_stars'
  },
  providerPaymentId: String,
  description: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Payment', paymentSchema);