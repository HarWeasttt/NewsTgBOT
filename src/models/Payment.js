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
  status: { 
    type: String, 
    enum: ['pending', 'succeeded', 'canceled', 'failed'], 
    default: 'pending' 
  },
  provider: {
    type: String,
    default: 'yookassa'
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

paymentSchema.index({ user: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Payment', paymentSchema);