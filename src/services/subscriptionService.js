const { User, SubscriptionPlan } = require('../models');
const config = require('../../config');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

class SubscriptionService {
  async getUserLimits(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const limits = config.LIMITS[user.subscription.type.toUpperCase()] || config.LIMITS.TRIAL;
    return limits;
  }

  async canAddChannel(userId) {
    const user = await User.findById(userId).populate('channels');
    const limits = await this.getUserLimits(userId);
    
    const currentChannels = await Channel.countDocuments({ owner: userId });
    return currentChannels < limits.CHANNELS;
  }

  async canAddPrompt(userId) {
    const user = await User.findById(userId).populate('prompts');
    const limits = await this.getUserLimits(userId);
    
    const currentPrompts = await Prompt.countDocuments({ owner: userId });
    return currentPrompts < limits.PROMPTS;
  }

  async activateTrial(userId) {
    const user = await User.findById(userId);
    if (user.trialUsed) {
      throw new Error('Пробный период уже использован');
    }

    const trialExpiry = new Date();
    trialExpiry.setDate(trialExpiry.getDate() + config.subscription.trialDays);

    user.subscription.type = 'trial';
    user.subscription.expiresAt = trialExpiry;
    user.trialUsed = true;
    
    await user.save();
    logger.info(`Trial activated for user ${userId}`);
    
    return user;
  }

  async upgradeSubscription(userId, planCode, paymentData = {}) {
    const user = await User.findById(userId);
    const plan = await SubscriptionPlan.findOne({ code: planCode, isActive: true });
    
    if (!plan) {
      throw new Error('Тарифный план не найден');
    }

    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1);

    user.subscription.type = planCode;
    user.subscription.expiresAt = expiryDate;
    user.subscription.autoRenew = paymentData.autoRenew || false;

    await user.save();
    logger.info(`User ${userId} upgraded to ${planCode} plan`);

    return { user, plan };
  }

  async checkExpiringSubscriptions() {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const expiringUsers = await User.find({
      'subscription.expiresAt': { 
        $lte: threeDaysFromNow,
        $gt: new Date() 
      },
      'subscription.autoRenew': false
    });

    for (const user of expiringUsers) {
      await this.sendExpirationWarning(user);
    }

    return expiringUsers.length;
  }

  async sendExpirationWarning(user) {
    // Здесь будет логика отправки уведомления пользователю
    logger.info(`Subscription expiration warning sent to user ${user.telegramId}`);
  }

  async getSubscriptionStatus(userId) {
    const user = await User.findById(userId);
    const plan = await SubscriptionPlan.findOne({ code: user.subscription.type });
    
    const limits = await this.getUserLimits(userId);
    const currentChannels = await Channel.countDocuments({ owner: userId });
    const currentPrompts = await Prompt.countDocuments({ owner: userId });

    return {
      type: user.subscription.type,
      expiresAt: user.subscription.expiresAt,
      isActive: user.hasActiveSubscription(),
      limits,
      usage: {
        channels: currentChannels,
        prompts: currentPrompts
      },
      planInfo: plan
    };
  }
}

module.exports = new SubscriptionService();