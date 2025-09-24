const { User } = require('../../models');
const logger = require('../../utils/logger');

const userAuth = async (ctx, next) => {
  try {
    if (!ctx.from) {
      return await next();
    }

    let user = await User.findOne({ telegramId: ctx.from.id });

    if (!user) {
      // Создание нового пользователя
      user = new User({
        telegramId: ctx.from.id,
        firstName: ctx.from.first_name,
        username: ctx.from.username
      });

      // Администраторы
      const config = require('../../../config');
      if (config.bot.adminIds.includes(ctx.from.id)) {
        user.isAdmin = true;
        user.subscription.type = 'professional';
        user.subscription.expiresAt = new Date('2030-01-01');
      }

      await user.save();
      logger.info(`New user registered: ${ctx.from.id} - ${ctx.from.first_name}`);
    } else {
      // Обновление последней активности
      user.lastActivity = new Date();
      user.firstName = ctx.from.first_name;
      user.username = ctx.from.username;
      await user.save();
    }

    ctx.session.user = user;
    await next();

  } catch (error) {
    logger.error('Auth middleware error:', error);
    await next();
  }
};

module.exports = userAuth;