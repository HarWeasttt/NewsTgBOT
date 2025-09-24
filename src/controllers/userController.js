const { User, Channel, Prompt, Schedule } = require('../models');
const subscriptionService = require('../services/subscriptionService');
const CONSTANTS = require('../utils/constants');
const Keyboards = require('../utils/keyboards');
const Helpers = require('../utils/helpers');

class UserController {
  async start(ctx) {
    const user = ctx.session.user;
    
    let message = CONSTANTS.MESSAGES.WELCOME;
    
    if (user.isTrialActive()) {
      const daysLeft = Math.ceil((user.subscription.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
      message += `\n\n${CONSTANTS.MESSAGES.TRIAL_ACTIVE(daysLeft)}`;
    }

    await ctx.replyWithMarkdown(message, Keyboards.mainMenu());
  }

  async help(ctx) {
    await ctx.replyWithMarkdown(CONSTANTS.MESSAGES.HELP, Keyboards.mainMenu());
  }

  async showCabinet(ctx) {
    const user = ctx.session.user;
    const status = await subscriptionService.getSubscriptionStatus(user._id);

    const message = `👤 **Ваш кабинет**

💎 **Тариф:** ${status.planInfo?.name || 'Пробный'}
📅 **Действует до:** ${Helpers.formatSubscriptionDate(status.expiresAt)}
${status.isActive ? '✅ Активен' : '❌ Не активен'}

📊 **Использование:**
📺 Каналы: ${status.usage.channels}/${status.limits.CHANNELS}
🔍 Промты: ${status.usage.prompts}/${status.limits.PROMPTS}

Выберите раздел для управления:`;

    await ctx.replyWithMarkdown(message, Keyboards.userCabinet());
  }

  async showChannels(ctx) {
    const user = ctx.session.user;
    const channels = await Channel.find({ owner: user._id });

    if (channels.length === 0) {
      await ctx.reply(
        '📺 У вас пока нет подключенных каналов.',
        Keyboards.channelsManagement()
      );
      return;
    }

    let message = '📺 **Ваши каналы:**\n\n';
    channels.forEach((channel, index) => {
      message += `${index + 1}. ${channel.title} (${channel.username || 'без username'})\n`;
      message += `   Статус: ${channel.isActive ? '✅ Активен' : '❌ Не активен'}\n\n`;
    });

    await ctx.replyWithMarkdown(message, Keyboards.channelsManagement());
  }

  async showPrompts(ctx) {
    const user = ctx.session.user;
    const prompts = await Prompt.find({ owner: user._id });

    if (prompts.length === 0) {
      await ctx.reply(
        '🔍 У вас пока нет созданных промтов.',
        Keyboards.promptsManagement()
      );
      return;
    }

    let message = '🔍 **Ваши промты:**\n\n';
    prompts.forEach((prompt, index) => {
      message += `${index + 1}. **${prompt.name}**\n`;
      message += `   Запрос: "${prompt.query}"\n`;
      message += `   Язык: ${prompt.language}\n`;
      message += `   Статус: ${prompt.isActive ? '✅ Активен' : '❌ Не активен'}\n\n`;
    });

    await ctx.replyWithMarkdown(message, Keyboards.promptsManagement());
  }

  async showSubscriptionStatus(ctx) {
    const user = ctx.session.user;
    const status = await subscriptionService.getSubscriptionStatus(user._id);

    const message = `💎 **Информация о подписке**

📋 **Тариф:** ${status.planInfo?.name || 'Пробный'}
💰 **Стоимость:** ${status.planInfo?.price || '0'} руб/мес
📅 **Действует до:** ${Helpers.formatSubscriptionDate(status.expiresAt)}
🔄 **Автопродление:** ${user.subscription.autoRenew ? '✅ Включено' : '❌ Выключено'}

📊 **Лимиты:**
📺 Каналы: ${status.limits.CHANNELS}
🔍 Промты: ${status.limits.PROMPTS}

${status.planInfo?.description || ''}`;

    await ctx.replyWithMarkdown(message, Keyboards.backToCabinet());
  }
}

module.exports = new UserController();