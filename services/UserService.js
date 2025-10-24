const User = require('../models/User');
const { SUBSCRIPTION_PLANS } = require('../config');

class UserService {
  /**
   * Создает или получает пользователя
   */
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

  /**
   * Проверяет доступ пользователя к AI-генерации
   */
  async hasAIAccess(user) {
    try {
      // Обновляем данные пользователя из БД
      const currentUser = await User.findById(user._id);
      if (!currentUser) return false;

      const userPlan = SUBSCRIPTION_PLANS[currentUser.subscription.plan];
      
      // Проверяем активна ли подписка
      const isSubscriptionActive = currentUser.subscription.isTrial || 
        (currentUser.subscription.endDate && currentUser.subscription.endDate > new Date());

      return isSubscriptionActive && userPlan?.aiAccess;
    } catch (error) {
      console.error('❌ Error checking AI access:', error);
      return false;
    }
  }

  /**
   * Проверяет возможность публикации поста
   */
  async canUserPost(user) {
    try {
      const currentUser = await User.findById(user._id);
      if (!currentUser) return false;

      // Сбрасываем дневные лимиты если нужно
      await this.resetDailyLimits(currentUser);

      // Проверяем активна ли подписка
      if (!currentUser.subscription.isTrial &&
          currentUser.subscription.endDate &&
          currentUser.subscription.endDate < new Date()) {
        return false;
      }

      // Проверяем дневной лимит
      const canPost = currentUser.limits.postsToday < currentUser.limits.postsPerDay;
      
      if (!canPost) {
        console.log(`⏸️ Daily limit reached: ${currentUser.limits.postsToday}/${currentUser.limits.postsPerDay}`);
      }
      
      return canPost;
    } catch (error) {
      console.error('❌ Error checking user post limit:', error);
      return false;
    }
  }

  /**
   * Увеличивает счетчик постов
   */
  async incrementPostCount(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        console.error('❌ User not found for incrementPostCount:', userId);
        return false;
      }

      // Сбрасываем лимиты если нужно
      await this.resetDailyLimits(user);

      // Инициализируем limits если их нет
      if (!user.limits || typeof user.limits.postsToday !== 'number') {
        user.limits = {
          postsToday: 0,
          postsPerDay: SUBSCRIPTION_PLANS[user.subscription.plan]?.postsPerDay || 5,
          channels: SUBSCRIPTION_PLANS[user.subscription.plan]?.channels || 1,
          lastReset: new Date()
        };
      }

      user.limits.postsToday += 1;
      await user.save();
      
      console.log(`✅ Post count incremented for user ${userId}: ${user.limits.postsToday}`);
      return true;
    } catch (error) {
      console.error('❌ Error incrementing post count:', error);
      return false;
    }
  }

  /**
   * Сбрасывает дневные лимиты
   */
  async resetDailyLimits(user) {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Инициализируем limits если их нет
      if (!user.limits) {
        user.limits = {
          postsToday: 0,
          postsPerDay: SUBSCRIPTION_PLANS[user.subscription.plan]?.postsPerDay || 5,
          channels: SUBSCRIPTION_PLANS[user.subscription.plan]?.channels || 1,
          lastReset: today
        };
        await user.save();
        return;
      }

      // Инициализируем lastReset если его нет
      if (!user.limits.lastReset) {
        user.limits.lastReset = today;
        user.limits.postsToday = 0;
        await user.save();
        return;
      }

      const lastReset = new Date(user.limits.lastReset);
      const lastResetDay = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getDate());

      // Сбрасываем счетчик если наступил новый день
      if (lastResetDay < today) {
        user.limits.postsToday = 0;
        user.limits.lastReset = today;
        await user.save();
        console.log(`🔄 Daily limits reset for user ${user.telegramId}`);
      }
    } catch (error) {
      console.error('❌ Error resetting daily limits:', error);
    }
  }

  /**
   * Упрощенная проверка AI доступа (для обратной совместимости)
   */
  async checkAIAccess(user) {
    return await this.hasAIAccess(user);
  }

  /**
   * Получает пользователя по ID
   */
  async getUserById(userId) {
    return await User.findById(userId);
  }

  /**
   * Обновляет подписку пользователя
   */
  async updateSubscription(userId, plan) {
    try {
      const planConfig = SUBSCRIPTION_PLANS[plan];
      if (!planConfig) {
        throw new Error('Plan not found');
      }

      const updateData = {
        'subscription.plan': plan,
        'subscription.isTrial': false,
        'subscription.endDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        'limits.postsPerDay': planConfig.postsPerDay,
        'limits.channels': planConfig.channels
      };

      return await User.findByIdAndUpdate(userId, updateData, { new: true });
    } catch (error) {
      console.error('❌ Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Получает статистику пользователей
   */
  async getUserStats() {
    try {
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
    } catch (error) {
      console.error('❌ Error getting user stats:', error);
      return {
        totalUsers: 0,
        activeSubscriptions: 0,
        trialUsers: 0
      };
    }
  }

  /**
   * Сбрасывает дневные лимиты для всех пользователей (для cron job)
   */
  async resetAllDailyLimits() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await User.updateMany(
        {
          $or: [
            { 'limits.lastReset': { $lt: today } },
            { 'limits.lastReset': { $exists: false } }
          ]
        },
        {
          $set: {
            'limits.postsToday': 0,
            'limits.lastReset': today
          }
        }
      );

      console.log(`🔄 Reset daily limits for ${result.modifiedCount} users`);
      return result.modifiedCount;
    } catch (error) {
      console.error('❌ Error resetting all daily limits:', error);
      return 0;
    }
  }

  /**
   * Получает информацию о лимитах пользователя
   */
  async getUserLimits(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return null;

      await this.resetDailyLimits(user);

      return {
        postsToday: user.limits.postsToday,
        postsPerDay: user.limits.postsPerDay,
        channels: user.limits.channels,
        plan: user.subscription.plan,
        isTrial: user.subscription.isTrial,
        trialEndDate: user.subscription.trialEndDate
      };
    } catch (error) {
      console.error('❌ Error getting user limits:', error);
      return null;
    }
  }
}

module.exports = new UserService();