const Transaction = require('../models/Transaction');
const UserService = require('./UserService');
const { SUBSCRIPTION_PLANS } = require('../config');

class PaymentService {
  async createInvoice(user, plan) {
    const planConfig = SUBSCRIPTION_PLANS[plan];
    if (!planConfig) {
      throw new Error('Invalid plan');
    }

    // Создаем pending транзакцию
    const transaction = new Transaction({
      userId: user._id,
      amount: planConfig.price,
      plan: plan,
      status: 'pending'
    });
    await transaction.save();

    return {
      transactionId: transaction._id,
      amount: planConfig.price,
      plan: planConfig.name
    };
  }

  async handleSuccessfulPayment(transactionId, telegramPaymentId) {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Обновляем статус транзакции
    transaction.status = 'completed';
    transaction.telegramPaymentId = telegramPaymentId;
    await transaction.save();

    // Обновляем подписку пользователя
    await UserService.updateSubscription(transaction.userId, transaction.plan);

    return transaction;
  }

  async getRevenueStats(startDate, endDate) {
    const matchStage = {
      status: 'completed',
      createdAt: { $gte: startDate, $lte: endDate }
    };

    const revenueStats = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    const planStats = await Transaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$plan',
          revenue: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      totalRevenue: revenueStats[0]?.totalRevenue || 0,
      transactionCount: revenueStats[0]?.transactionCount || 0,
      planStats
    };
  }
}

module.exports = new PaymentService();