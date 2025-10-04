const User = require('../models/User');
const { SUBSCRIPTION_PLANS } = require('../config');

class UserService {
  async getOrCreateUser(telegramUser) {
    let user = await User.findOne({ telegramId: telegramUser.id });

    if (!user) {
      user = new User({
        telegramId: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name
      });
      await user.save();
    }

    return user;
  }
  /** Проверяет доступ пользователя к AI-генерации */
  static async hasAIAccess(user) {
    // Обновляем данные пользователя из БД
    const currentUser = await User.findById(user._id);
    const userPlan = SUBSCRIPTION_PLANS[currentUser.subscription.plan];

    return currentUser.subscription.isTrial || userPlan?.aiAccess;
  }
  /** Проверяет возможность публикации поста */
  static async canUserPost(user) {
    const currentUser = await User.findById(user._id);

    // Проверяем сброс дневного лимита
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (currentUser.limits.lastReset < today) {
      currentUser.limits.postsToday = 0;
      currentUser.limits.lastReset = today;
      await currentUser.save();
    }

    return currentUser.limits.postsToday < currentUser.limits.postsPerDay;
  }
  // Упрощенная проверка AI доступа
  async checkAIAccess(user) {
    const userPlan = SUBSCRIPTION_PLANS[user.subscription.plan];
    return user.subscription.isTrial || userPlan?.aiAccess;
  }

  async getUserById(userId) {
    return await User.findById(userId);
  }

  async canUserPost(user) {
    await this.resetDailyLimits(user);

    if (user.subscription.isTrial) {
      return true;
    }

    const plan = SUBSCRIPTION_PLANS[user.subscription.plan];
    return user.limits.postsToday < user.limits.postsPerDay;
  }

  async incrementPostCount(user) {
    user.limits.postsToday += 1;
    await user.save();
  }

  async resetDailyLimits(user) {
    const now = new Date();
    const lastReset = new Date(user.limits.lastReset);

    if (now.toDateString() !== lastReset.toDateString()) {
      user.limits.postsToday = 0;
      user.limits.lastReset = now;
      await user.save();
    }
  }

  async incrementPostCount(user) {
    user.limits.postsToday += 1;
    await user.save();
  }

  async updateSubscription(userId, plan) {
    const planConfig = SUBSCRIPTION_PLANS[plan];
    if (!planConfig) return null;

    return await User.findByIdAndUpdate(
      userId,
      {
        'subscription.plan': plan,
        'subscription.isTrial': false,
        'subscription.endDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        'limits.channels': planConfig.channels,
        'limits.postsPerDay': planConfig.postsPerDay
      },
      { new: true }
    );
  }

  async getUserStats() {
    const totalUsers = await User.countDocuments();
    const activeSubscriptions = await User.countDocuments({
      'subscription.plan': { $ne: 'FREE' },
      'subscription.endDate': { $gt: new Date() }
    });
    const trialUsers = await User.countDocuments({
      'subscription.isTrial': true,
      'subscription.trialEndDate': { $gt: new Date() }
    });

    return {
      totalUsers,
      activeSubscriptions,
      trialUsers
    };
  }
}

module.exports = new UserService();