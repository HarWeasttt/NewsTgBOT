const { User } = require('../../models');
const CONSTANTS = require('../../utils/constants');
const Keyboards = require('../../utils/keyboards');

const subscriptionCheck = async (ctx, next) => {
  // Пропускаем команды start, help и админские команды
  if (ctx.message?.text === '/start' || 
      ctx.message?.text === '/help' ||
      ctx.message?.text === '💳 Тарифы' ||
      ctx.message?.text?.includes('Поддержка') ||
      (ctx.session.user && ctx.session.user.isAdmin)) {
    return await next();
  }

  const user = ctx.session.user;

  if (!user) {
    return await ctx.reply('Пожалуйста, сначала отправьте /start');
  }

  if (!user.hasActiveSubscription()) {
    if (user.subscription.type === 'trial' && user.trialUsed) {
      await ctx.reply(
        CONSTANTS.MESSAGES.TRIAL_EXPIRED,
        Keyboards.subscriptionPlans([])
      );
    } else {
      await ctx.reply(
        CONSTANTS.MESSAGES.SUBSCRIPTION_EXPIRED,
        Keyboards.subscriptionPlans([])
      );
    }
    return;
  }

  await next();
};

module.exports = subscriptionCheck;