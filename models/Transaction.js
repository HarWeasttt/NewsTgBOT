const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    telegramId: {
        type: Number,
        required: true
    },
    plan: {
        type: String,
        required: true
    },
    months: {
        type: Number,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'XTR'
    },
    providerPaymentChargeId: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    metadata: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

// Индексы для быстрого поиска
transactionSchema.index({ userId: 1 });
transactionSchema.index({ telegramId: 1 });
transactionSchema.index({ createdAt: 1 });
transactionSchema.index({ status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);