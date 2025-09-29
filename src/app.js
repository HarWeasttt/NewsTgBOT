const { Telegraf, session, Scenes: { Stage, WizardScene } } = require('telegraf');
const express = require('express');
const config = require('../config');
const { connectDB } = require('../config/database');

// Middleware
const userAuth = require('./bot/middleware/auth');

// Models
const { Channel, Prompt, User, SubscriptionPlan, Payment } = require('./models');

// Utils
const Keyboards = require('./utils/keyboards');
const Helpers = require('./utils/helpers');

// ==================== КОНСТАНТЫ ====================

const STARS_CONFIG = {
  RUB_TO_STARS: 7,
  MIN_STARS: 10
};

// ==================== СЦЕНЫ ====================

const addChannelScene = new WizardScene(
  'ADD_CHANNEL_SCENE',
  async (ctx) => {
    const canAdd = await checkChannelLimit(ctx);
    if (!canAdd) return ctx.scene.leave();

    await ctx.reply(
      '📺 **Добавление канала**\n\nПерешлите сообщение из канала или введите @username:',
      Keyboards.cancelAction()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.backToCabinet());
      return ctx.scene.leave();
    }

    try {
      let channelInfo;
      
      if (ctx.message.forward_from_chat) {
        channelInfo = ctx.message.forward_from_chat;
      } else if (ctx.message.text.startsWith('@')) {
        const username = ctx.message.text.replace('@', '');
        channelInfo = await ctx.telegram.getChat(`@${username}`);
      } else {
        await ctx.reply('Перешлите сообщение или введите @username');
        return;
      }

      if (channelInfo.type !== 'channel') {
        await ctx.reply('❌ Это не канал.');
        return;
      }

      try {
        const member = await ctx.telegram.getChatMember(channelInfo.id, ctx.botInfo.id);
        if (!(member.status === 'administrator' && member.can_post_messages)) {
          await ctx.reply('❌ Бот не имеет прав на отправку сообщений.');
          return;
        }
      } catch (error) {
        await ctx.reply('❌ Бот не добавлен в канал.');
        return;
      }

      const existingChannel = await Channel.findOne({ 
        telegramId: channelInfo.id,
        owner: ctx.session.user._id
      });
      
      if (existingChannel) {
        await ctx.reply('❌ Этот канал уже добавлен.');
        return ctx.scene.leave();
      }

      ctx.wizard.state.channelData = {
        telegramId: channelInfo.id,
        title: channelInfo.title,
        username: channelInfo.username
      };

      await ctx.reply('✅ Канал найден! Введите шаблон поста:', Keyboards.cancelAction());
      return ctx.wizard.next();

    } catch (error) {
      await ctx.reply('❌ Ошибка при добавлении канала.');
      return ctx.scene.leave();
    }
  },
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.backToCabinet());
      return ctx.scene.leave();
    }

    try {
      const channel = new Channel({
        ...ctx.wizard.state.channelData,
        postTemplate: ctx.message.text || '{title}\n\n{summary}\n\n{source_link}',
        owner: ctx.session.user._id
      });

      await channel.save();
      await ctx.reply(`✅ Канал "${channel.title}" добавлен!`, Keyboards.channelsManagement());

    } catch (error) {
      await ctx.reply('❌ Ошибка сохранения.');
    }

    return ctx.scene.leave();
  }
);

const addPromptScene = new WizardScene(
  'ADD_PROMPT_SCENE',
  async (ctx) => {
    const canAdd = await checkPromptLimit(ctx);
    if (!canAdd) return ctx.scene.leave();

    await ctx.reply('🔍 Введите название промта:', Keyboards.cancelAction());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
      return ctx.scene.leave();
    }

    ctx.wizard.state.promptData = { name: ctx.message.text };
    await ctx.reply('📝 Введите поисковый запрос:', Keyboards.cancelAction());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
      return ctx.scene.leave();
    }

    const { name } = ctx.wizard.state.promptData;

    try {
      const prompt = new Prompt({
        name: name,
        query: ctx.message.text,
        language: 'ru',
        keywordsToExclude: [],
        owner: ctx.session.user._id
      });

      await prompt.save();
      await ctx.reply(`✅ Промт "${name}" создан!`, Keyboards.promptsManagement());

    } catch (error) {
      await ctx.reply('❌ Ошибка создания промта.');
    }

    return ctx.scene.leave();
  }
);

// Сцена создания/редактирования тарифа
const tariffScene = new WizardScene(
  'TARIFF_SCENE',
  async (ctx) => {
    await ctx.reply(
      '⚙️ **Управление тарифом**\n\n' +
      'Введите название тарифа:',
      Keyboards.cancelAction()
    );
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.adminMenu());
      return ctx.scene.leave();
    }

    ctx.wizard.state.tariffData = { name: ctx.message.text };
    await ctx.reply('Введите код тарифа (латинскими буквами, например: basic):', Keyboards.cancelAction());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.adminMenu());
      return ctx.scene.leave();
    }

    ctx.wizard.state.tariffData.code = ctx.message.text.toLowerCase();
    await ctx.reply('Введите стоимость в рублях:', Keyboards.cancelAction());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.adminMenu());
      return ctx.scene.leave();
    }

    const price = parseInt(ctx.message.text);
    if (isNaN(price) || price < 0) {
      await ctx.reply('❌ Введите корректную стоимость (число):');
      return;
    }

    ctx.wizard.state.tariffData.price = price;
    await ctx.reply('Введите лимит каналов:', Keyboards.cancelAction());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.adminMenu());
      return ctx.scene.leave();
    }

    const channelsLimit = parseInt(ctx.message.text);
    if (isNaN(channelsLimit) || channelsLimit < 1) {
      await ctx.reply('❌ Введите корректный лимит каналов (число от 1):');
      return;
    }

    ctx.wizard.state.tariffData.channelsLimit = channelsLimit;
    await ctx.reply('Введите лимит промтов:', Keyboards.cancelAction());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.adminMenu());
      return ctx.scene.leave();
    }

    const promptsLimit = parseInt(ctx.message.text);
    if (isNaN(promptsLimit) || promptsLimit < 1) {
      await ctx.reply('❌ Введите корректный лимит промтов (число от 1):');
      return;
    }

    ctx.wizard.state.tariffData.promptsLimit = promptsLimit;
    
    try {
      const tariff = new SubscriptionPlan(ctx.wizard.state.tariffData);
      await tariff.save();

      await ctx.reply(
        `✅ Тариф "${tariff.name}" создан!\n\n` +
        `Код: ${tariff.code}\n` +
        `Цена: ${tariff.price} руб\n` +
        `Лимиты: ${tariff.channelsLimit} каналов, ${tariff.promptsLimit} промтов`,
        Keyboards.adminMenu()
      );

    } catch (error) {
      await ctx.reply('❌ Ошибка создания тарифа: ' + error.message);
    }

    return ctx.scene.leave();
  }
);

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

async function checkChannelLimit(ctx) {
  const user = ctx.session.user;
  
  if (!user.hasActiveSubscription()) {
    await ctx.reply('❌ Для добавления каналов требуется активная подписка.');
    return false;
  }

  const limits = getUserLimits(user);
  const currentChannels = await Channel.countDocuments({ owner: user._id });

  if (currentChannels >= limits.channels) {
    await ctx.reply(
      `❌ **Достигнут лимит каналов**\n\n` +
      `Ваш тариф позволяет иметь не более ${limits.channels} каналов.\n\n` +
      `💡 Обновите тариф в разделе "💳 Тарифы"`
    );
    return false;
  }
  return true;
}

async function checkPromptLimit(ctx) {
  const user = ctx.session.user;
  
  if (!user.hasActiveSubscription()) {
    await ctx.reply('❌ Для создания промтов требуется активная подписка.');
    return false;
  }

  const limits = getUserLimits(user);
  const currentPrompts = await Prompt.countDocuments({ owner: user._id });

  if (currentPrompts >= limits.prompts) {
    await ctx.reply(
      `❌ **Достигнут лимит промтов**\n\n` +
      `Ваш тариф позволяет иметь не более ${limits.prompts} промтов.\n\n` +
      `💡 Обновите тариф в разделе "💳 Тарифы"`
    );
    return false;
  }
  return true;
}

function getUserLimits(user) {
  const limits = {
    trial: { channels: 1, prompts: 1 },
    basic: { channels: 2, prompts: 3 },
    advanced: { channels: 5, prompts: 10 },
    professional: { channels: 999, prompts: 999 }
  };
  return limits[user.subscription.type] || limits.trial;
}

function rubToStars(rubAmount) {
  return Math.ceil(rubAmount * STARS_CONFIG.RUB_TO_STARS);
}

// ==================== КОНТРОЛЛЕРЫ ====================

class UserController {
  async start(ctx) {
    const user = ctx.session.user;
    
    if (!user.trialUsed && user.subscription.type === 'trial') {
      const trialExpiry = new Date();
      trialExpiry.setDate(trialExpiry.getDate() + 7);
      user.subscription.expiresAt = trialExpiry;
      user.trialUsed = true;
      await user.save();
    }

    const trialMessage = user.isTrialActive() ? 
      `🆓 **Пробный период активен!** (до ${Helpers.formatSubscriptionDate(user.subscription.expiresAt)})` :
      '💎 **Выберите подписку для начала работы**';

    const message = `🤖 **Добро пожаловать в NewsBot!**\n\n` +
      `Автоматизация публикации новостей в Telegram каналах.\n\n` +
      `${trialMessage}\n\n` +
      `💫 **Оплата через Telegram Stars** - быстро и безопасно!\n\n` +
      `Нажмите "📊 Мой кабинет" чтобы начать.`;

    await ctx.replyWithMarkdown(message, Keyboards.mainMenu());
  }

  async help(ctx) {
    const message = `📖 **Справка**\n\n` +
      `**Основные функции:**\n` +
      `• 📊 Мой кабинет - управление настройками\n` +
      `• 📺 Мои каналы - добавление каналов\n` +
      `• 🔍 Мои промты - поисковые запросы\n` +
      `• ⏰ Расписание - время публикаций\n` +
      `• 💳 Тарифы - выбор подписки\n\n` +
      `💫 **Оплата через Telegram Stars:**\n` +
      `• Быстро и безопасно\n` +
      `• Не нужно вводить данные карты\n` +
      `• Мгновенная активация подписки\n\n` +
      `**Начало работы:**\n` +
      `1. Добавьте канал\n` +
      `2. Создайте промт\n` +
      `3. Выберите тариф и оплатите Stars`;

    await ctx.replyWithMarkdown(message, Keyboards.mainMenu());
  }

  async showCabinet(ctx) {
    const user = ctx.session.user;
    const channelsCount = await Channel.countDocuments({ owner: user._id });
    const promptsCount = await Prompt.countDocuments({ owner: user._id });
    const limits = getUserLimits(user);

    const status = user.hasActiveSubscription() ? 
      `✅ Активен (до ${Helpers.formatSubscriptionDate(user.subscription.expiresAt)})` : 
      '❌ Не активен';

    const message = `👤 **Ваш кабинет**\n\n` +
      `💎 Тариф: ${user.subscription.type.toUpperCase()}\n` +
      `📅 Статус: ${status}\n\n` +
      `📊 Использование:\n` +
      `📺 Каналы: ${channelsCount}/${limits.channels} ${channelsCount >= limits.channels ? '❌ Лимит' : ''}\n` +
      `🔍 Промты: ${promptsCount}/${limits.prompts} ${promptsCount >= limits.prompts ? '❌ Лимит' : ''}`;

    await ctx.replyWithMarkdown(message, Keyboards.userCabinet());
  }

  async showChannels(ctx) {
    const user = ctx.session.user;
    
    if (!user.hasActiveSubscription()) {
      return await this.showSubscriptionRequired(ctx);
    }

    const channels = await Channel.find({ owner: user._id });

    if (channels.length === 0) {
      await ctx.reply('📺 Нет подключенных каналов.', Keyboards.channelsManagement());
      return;
    }

    let message = '📺 **Ваши каналы:**\n\n';
    channels.forEach((channel, index) => {
      message += `${index + 1}. ${channel.title}\n`;
      message += `   Статус: ${channel.isActive ? '✅ Активен' : '❌ Не активен'}\n\n`;
    });

    await ctx.replyWithMarkdown(message, Keyboards.channelsManagement());
  }

  async showPrompts(ctx) {
    const user = ctx.session.user;
    
    if (!user.hasActiveSubscription()) {
      return await this.showSubscriptionRequired(ctx);
    }

    const prompts = await Prompt.find({ owner: user._id });

    if (prompts.length === 0) {
      await ctx.reply('🔍 Нет созданных промтов.', Keyboards.promptsManagement());
      return;
    }

    let message = '🔍 **Ваши промты:**\n\n';
    prompts.forEach((prompt, index) => {
      message += `${index + 1}. **${prompt.name}**\n`;
      message += `   Запрос: "${prompt.query}"\n\n`;
    });

    await ctx.replyWithMarkdown(message, Keyboards.promptsManagement());
  }

  async showTariffs(ctx) {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ price: 1 });
    const user = ctx.session.user;

    let message = '💳 **Доступные тарифы**\n\n';

    plans.forEach((plan) => {
      const starsAmount = rubToStars(plan.price);
      const isCurrent = user.subscription.type === plan.code;
      
      message += `${isCurrent ? '⭐ ' : ''}**${plan.name}**\n`;
      message += `   💰 ${plan.price} руб | ⭐ ${starsAmount} звезд\n`;
      message += `   📺 ${plan.channelsLimit} каналов | 🔍 ${plan.promptsLimit} промтов\n`;
      message += `   ${plan.description || ''}\n`;
      
      if (isCurrent && user.hasActiveSubscription()) {
        message += `   ✅ Ваш текущий тариф\n`;
      }
      
      message += `\n`;
    });

    message += `💫 **Как оплатить:**\n` +
      `• Нажмите кнопку "💫 Купить" под нужным тарифом\n` +
      `• Подтвердите оплату в Telegram\n` +
      `• Подписка активируется мгновенно!\n\n` +
      `💡 *Курс: 1 рубль ≈ ${STARS_CONFIG.RUB_TO_STARS} звезд*`;

    await ctx.replyWithMarkdown(message, Keyboards.tariffsMenu());
  }

  async handleBuyBasic(ctx) {
    await this.handleSubscriptionCommand(ctx, 'basic');
  }

  async handleBuyAdvanced(ctx) {
    await this.handleSubscriptionCommand(ctx, 'advanced');
  }

  async handleBuyProfessional(ctx) {
    await this.handleSubscriptionCommand(ctx, 'professional');
  }

  async handleSubscriptionCommand(ctx, planCode) {
    const user = ctx.session.user;
    const plan = await SubscriptionPlan.findOne({ code: planCode, isActive: true });

    if (!plan) {
      return await ctx.reply('❌ Тарифный план не найден.');
    }

    if (user.subscription.type === plan.code && user.hasActiveSubscription()) {
      return await ctx.reply(`ℹ️ У вас уже активен тариф "${plan.name}".`);
    }

    const starsAmount = rubToStars(plan.price);
    ctx.session.selectedPlan = planCode;

    const message = `💫 **Оплата подписки: ${plan.name}**\n\n` +
      `📋 Тариф: ${plan.name}\n` +
      `💰 Стоимость: ${plan.price} руб\n` +
      `⭐ Необходимо звезд: ${starsAmount}\n` +
      `📅 Срок: 1 месяц\n\n` +
      `📊 **Включает:**\n` +
      `• ${plan.channelsLimit} каналов\n` +
      `• ${plan.promptsLimit} промтов\n` +
      `• Автоматическую публикацию новостей\n\n` +
      `💫 **Для оплаты:**\n` +
      `1. Отправьте боту ${starsAmount} звезд\n` +
      `2. Подписка активируется автоматически`;

    await ctx.replyWithMarkdown(message, 
      Markup.inlineKeyboard([
        Markup.button.callback(`💫 Отправить ${starsAmount} звезд`, `pay_${planCode}`)
      ])
    );
  }

  async handlePaymentCallback(ctx, planCode) {
    const plan = await SubscriptionPlan.findOne({ code: planCode, isActive: true });
    const starsAmount = rubToStars(plan.price);

    await ctx.reply(
      `💫 **Готов к приему оплаты**\n\n` +
      `Для оплаты подписки "${plan.name}" отправьте ${starsAmount} звезд этому боту.\n\n` +
      `📱 **Как отправить звезды:**\n` +
      `1. Нажмите и удерживайте любое сообщение\n` +
      `2. Выберите "⭐ Отправить звезды"\n` +
      `3. Укажите количество: ${starsAmount}\n` +
      `4. Подтвердите перевод\n\n` +
      `✅ После получения звезд подписка активируется автоматически.`,
      Keyboards.backToMain()
    );

    ctx.session.selectedPlan = planCode;
    ctx.answerCbQuery();
  }

  async processStarsPayment(ctx, starsAmount) {
    const user = ctx.session.user;
    const planCode = ctx.session.selectedPlan;

    if (!planCode) {
      return await ctx.reply('❌ Не выбран тариф для оплаты. Выберите тариф сначала.');
    }

    const plan = await SubscriptionPlan.findOne({ code: planCode, isActive: true });

    if (!plan) {
      return await ctx.reply('❌ Тарифный план не найден.');
    }

    const expectedStars = rubToStars(plan.price);
    if (starsAmount < expectedStars) {
      return await ctx.reply(
        `❌ **Недостаточно звезд!**\n\n` +
        `Требуется: ${expectedStars} звезд\n` +
        `Получено: ${starsAmount} звезд\n\n` +
        `Пожалуйста, отправьте необходимое количество.`
      );
    }

    try {
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1);

      user.subscription.type = plan.code;
      user.subscription.expiresAt = expiryDate;
      await user.save();

      const payment = new Payment({
        user: user._id,
        plan: plan._id,
        amount: plan.price,
        starsAmount: starsAmount,
        status: 'succeeded',
        provider: 'telegram_stars',
        description: `Оплата Stars: ${plan.name}`
      });
      await payment.save();

      const message = `🎉 **Подписка активирована!**\n\n` +
        `💎 Тариф: ${plan.name}\n` +
        `⭐ Оплачено: ${starsAmount} звезд\n` +
        `📅 Действует до: ${Helpers.formatSubscriptionDate(expiryDate)}\n\n` +
        `📊 **Теперь доступно:**\n` +
        `• ${plan.channelsLimit} каналов\n` +
        `• ${plan.promptsLimit} промтов\n` +
        `• Автоматическая публикация новостей\n\n` +
        `🚀 Приступайте к настройке!`;

      await ctx.replyWithMarkdown(message, Keyboards.mainMenu());

      delete ctx.session.selectedPlan;
      await this.notifyAdminAboutPayment(ctx, user, plan, starsAmount);

    } catch (error) {
      console.error('Payment error:', error);
      await ctx.reply('❌ Ошибка при активации подписки. Попробуйте еще раз.');
    }
  }

  async showSubscriptionStatus(ctx) {
    const user = ctx.session.user;
    const plan = await SubscriptionPlan.findOne({ code: user.subscription.type });

    const status = user.hasActiveSubscription() ? 
      `✅ Активна (до ${Helpers.formatSubscriptionDate(user.subscription.expiresAt)})` : 
      '❌ Не активна';

    const message = `💎 **Информация о подписке**\n\n` +
      `📋 Тариф: ${plan ? plan.name : user.subscription.type}\n` +
      `📅 Статус: ${status}\n` +
      `🔄 Автопродление: ${user.subscription.autoRenew ? '✅' : '❌'}\n\n` +
      `${plan ? `Лимиты: ${plan.channelsLimit} каналов, ${plan.promptsLimit} промтов` : ''}`;

    await ctx.replyWithMarkdown(message, Keyboards.backToCabinet());
  }

  async showSupport(ctx) {
    await ctx.reply(
      '👨‍💻 **Поддержка**\n\nПо вопросам оплаты и работы бота обращайтесь: @username',
      Keyboards.backToMain()
    );
  }

  async showSubscriptionRequired(ctx) {
    await ctx.reply(
      '❌ **Требуется подписка**\n\n' +
      'Для доступа к этому разделу необходимо активировать подписку.\n\n' +
      '💫 **Оплата через Telegram Stars** - быстро и удобно!\n\n' +
      'Выберите тариф в разделе "💳 Тарифы"',
      Keyboards.mainMenu()
    );
  }

  async notifyAdminAboutPayment(ctx, user, plan, starsAmount) {
    try {
      const adminMessage = `💫 **Новый платеж Stars**\n\n` +
        `👤 Пользователь: ${user.firstName} (@${user.username || 'нет'})\n` +
        `💎 Тариф: ${plan.name}\n` +
        `⭐ Звезд: ${starsAmount} (${plan.price} руб)\n` +
        `🆔 ID: ${user.telegramId}`;

      const admins = await User.find({ isAdmin: true });
      for (const admin of admins) {
        await ctx.telegram.sendMessage(admin.telegramId, adminMessage);
      }
    } catch (error) {
      console.error('Admin notification error:', error);
    }
  }
}

class ChannelController {
  async startAddChannel(ctx) {
    return ctx.scene.enter('ADD_CHANNEL_SCENE');
  }

  async deleteChannel(ctx, channelId) {
    try {
      const channel = await Channel.findOne({ _id: channelId, owner: ctx.session.user._id });
      if (!channel) return ctx.reply('❌ Канал не найден.');

      await Channel.findByIdAndDelete(channelId);
      await ctx.reply(`✅ Канал "${channel.title}" удален.`, Keyboards.channelsManagement());

    } catch (error) {
      await ctx.reply('❌ Ошибка удаления.');
    }
  }
}

class PromptController {
  async startAddPrompt(ctx) {
    return ctx.scene.enter('ADD_PROMPT_SCENE');
  }

  async deletePrompt(ctx, promptId) {
    try {
      const prompt = await Prompt.findOne({ _id: promptId, owner: ctx.session.user._id });
      if (!prompt) return ctx.reply('❌ Промт не найден.');

      await Prompt.findByIdAndDelete(promptId);
      await ctx.reply(`✅ Промт "${prompt.name}" удален.`, Keyboards.promptsManagement());

    } catch (error) {
      await ctx.reply('❌ Ошибка удаления.');
    }
  }
}

class AdminController {
  async showPanel(ctx) {
    if (!this.isAdmin(ctx)) return ctx.reply('❌ Нет прав доступа.');

    await ctx.reply('👑 **Панель администратора**', Keyboards.adminMenu());
  }

  async showStats(ctx) {
    if (!this.isAdmin(ctx)) return;

    const [totalUsers, activeUsers, totalChannels, totalPrompts, totalPayments, revenue] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ 'subscription.expiresAt': { $gt: new Date() } }),
      Channel.countDocuments(),
      Prompt.countDocuments(),
      Payment.countDocuments({ status: 'succeeded' }),
      Payment.aggregate([{ $match: { status: 'succeeded' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);

    const revenueTotal = revenue[0]?.total || 0;
    const totalStars = await Payment.aggregate([
      { $match: { status: 'succeeded', starsAmount: { $exists: true } } },
      { $group: { _id: null, total: { $sum: '$starsAmount' } } }
    ]);

    const starsTotal = totalStars[0]?.total || 0;

    const message = `📊 **Статистика системы**\n\n` +
      `👥 Пользователи: ${totalUsers} (${activeUsers} активных)\n` +
      `📺 Каналов: ${totalChannels} | Промтов: ${totalPrompts}\n` +
      `💰 Доход: ${revenueTotal} руб.\n` +
      `⭐ Звезд получено: ${starsTotal}\n` +
      `💳 Платежей: ${totalPayments}`;

    await ctx.replyWithMarkdown(message, Keyboards.adminMenu());
  }

  async showUsers(ctx) {
    if (!this.isAdmin(ctx)) return;

    const users = await User.find().sort({ createdAt: -1 }).limit(10);

    let message = '👥 **Последние 10 пользователей**\n\n';
    users.forEach((user, index) => {
      const days = Math.floor((new Date() - user.createdAt) / (1000 * 60 * 60 * 24));
      message += `${index + 1}. ${user.firstName} (@${user.username || 'нет'})\n`;
      message += `   Тариф: ${user.subscription.type} | ${days} дн. назад\n\n`;
    });

    await ctx.replyWithMarkdown(message, Keyboards.adminMenu());
  }

  async showTariffs(ctx) {
    if (!this.isAdmin(ctx)) return;

    const plans = await SubscriptionPlan.find().sort({ price: 1 });

    let message = '⚙️ **Управление тарифами**\n\n';

    plans.forEach((plan, index) => {
      message += `${index + 1}. **${plan.name}** (${plan.code})\n`;
      message += `   💰 ${plan.price} руб | 📺 ${plan.channelsLimit} | 🔍 ${plan.promptsLimit}\n`;
      message += `   Статус: ${plan.isActive ? '✅ Активен' : '❌ Не активен'}\n`;
      message += `   ID: ${plan._id}\n\n`;
    });

    message += '**Действия:**\n';
    message += '• /create_tariff - Создать новый тариф\n';
    message += '• /edit_tariff [id] - Редактировать тариф\n';
    message += '• /toggle_tariff [id] - Включить/выключить тариф\n';
    message += '• /delete_tariff [id] - Удалить тариф';

    await ctx.replyWithMarkdown(message, Keyboards.adminTariffsMenu());
  }

  async createTariff(ctx) {
    if (!this.isAdmin(ctx)) return;
    return ctx.scene.enter('TARIFF_SCENE');
  }

  async editTariff(ctx, tariffId) {
    if (!this.isAdmin(ctx)) return;

    try {
      const plan = await SubscriptionPlan.findById(tariffId);
      if (!plan) return ctx.reply('❌ Тариф не найден.');

      const message = `✏️ **Редактирование тарифа: ${plan.name}**\n\n` +
        `Текущие значения:\n` +
        `• Название: ${plan.name}\n` +
        `• Код: ${plan.code}\n` +
        `• Цена: ${plan.price} руб\n` +
        `• Лимит каналов: ${plan.channelsLimit}\n` +
        `• Лимит промтов: ${plan.promptsLimit}\n\n` +
        `Для изменения используйте команды:\n` +
        `/set_tariff_name ${tariffId} [новое название]\n` +
        `/set_tariff_price ${tariffId} [новая цена]\n` +
        `/set_tariff_limits ${tariffId} [каналы] [промты]`;

      await ctx.replyWithMarkdown(message, Keyboards.adminMenu());

    } catch (error) {
      await ctx.reply('❌ Ошибка: ' + error.message);
    }
  }

  async setTariffName(ctx, tariffId, newName) {
    if (!this.isAdmin(ctx)) return;

    try {
      await SubscriptionPlan.findByIdAndUpdate(tariffId, { name: newName });
      await ctx.reply(`✅ Название тарифа изменено на "${newName}"`, Keyboards.adminMenu());
    } catch (error) {
      await ctx.reply('❌ Ошибка: ' + error.message);
    }
  }

  async setTariffPrice(ctx, tariffId, newPrice) {
    if (!this.isAdmin(ctx)) return;

    try {
      const price = parseInt(newPrice);
      if (isNaN(price)) throw new Error('Некорректная цена');

      await SubscriptionPlan.findByIdAndUpdate(tariffId, { price: price });
      await ctx.reply(`✅ Цена тарифа изменена на ${price} руб`, Keyboards.adminMenu());
    } catch (error) {
      await ctx.reply('❌ Ошибка: ' + error.message);
    }
  }

  async setTariffLimits(ctx, tariffId, channelsLimit, promptsLimit) {
    if (!this.isAdmin(ctx)) return;

    try {
      const channels = parseInt(channelsLimit);
      const prompts = parseInt(promptsLimit);

      if (isNaN(channels) || isNaN(prompts)) {
        throw new Error('Некорректные лимиты');
      }

      await SubscriptionPlan.findByIdAndUpdate(tariffId, {
        channelsLimit: channels,
        promptsLimit: prompts
      });

      await ctx.reply(`✅ Лимиты изменены: ${channels} каналов, ${prompts} промтов`, Keyboards.adminMenu());
    } catch (error) {
      await ctx.reply('❌ Ошибка: ' + error.message);
    }
  }

  async toggleTariff(ctx, tariffId) {
    if (!this.isAdmin(ctx)) return;

    try {
      const plan = await SubscriptionPlan.findById(tariffId);
      if (!plan) return ctx.reply('❌ Тариф не найден.');

      plan.isActive = !plan.isActive;
      await plan.save();

      await ctx.reply(
        `✅ Тариф "${plan.name}" ${plan.isActive ? 'активирован' : 'деактивирован'}`,
        Keyboards.adminMenu()
      );
    } catch (error) {
      await ctx.reply('❌ Ошибка: ' + error.message);
    }
  }

  async deleteTariff(ctx, tariffId) {
    if (!this.isAdmin(ctx)) return;

    try {
      const plan = await SubscriptionPlan.findById(tariffId);
      if (!plan) return ctx.reply('❌ Тариф не найден.');

      // Проверяем, есть ли пользователи с этим тарифом
      const usersWithPlan = await User.countDocuments({ 'subscription.type': plan.code });
      
      if (usersWithPlan > 0) {
        return await ctx.reply(
          `❌ Нельзя удалить тариф!\n\n` +
          `На этом тарифе ${usersWithPlan} пользователей.\n` +
          `Сначала переведите их на другие тарифы.`
        );
      }

      await SubscriptionPlan.findByIdAndDelete(tariffId);
      await ctx.reply(`✅ Тариф "${plan.name}" удален`, Keyboards.adminMenu());

    } catch (error) {
      await ctx.reply('❌ Ошибка: ' + error.message);
    }
  }

  async broadcastMessage(ctx) {
    if (!this.isAdmin(ctx)) return;

    await ctx.reply('📢 Введите сообщение для рассылки:', Keyboards.cancelAction());
    ctx.session.waitingForBroadcast = true;
  }

  async handleBroadcastMessage(ctx) {
    if (!ctx.session.waitingForBroadcast) return;

    const users = await User.find();
    let success = 0, errors = 0;

    await ctx.reply(`📤 Рассылка для ${users.length} пользователей...`);

    for (const user of users) {
      try {
        await ctx.telegram.sendMessage(user.telegramId, ctx.message.text);
        success++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        errors++;
      }
    }

    delete ctx.session.waitingForBroadcast;
    await ctx.reply(`✅ Рассылка завершена!\nУспешно: ${success}\nОшибок: ${errors}`, Keyboards.adminMenu());
  }

  async setUserPlan(ctx) {
    if (!this.isAdmin(ctx)) return;

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) return ctx.reply('Использование: /setplan [user_id] [plan_code]');

    const [userId, planCode] = args;

    try {
      const user = await User.findOne({ telegramId: parseInt(userId) });
      if (!user) return ctx.reply('❌ Пользователь не найден');

      const plan = await SubscriptionPlan.findOne({ code: planCode });
      if (!plan) return ctx.reply('❌ Тариф не найден');

      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      user.subscription.type = plan.code;
      user.subscription.expiresAt = expiry;
      await user.save();

      await ctx.reply(`✅ Пользователю ${user.firstName} установлен тариф "${plan.name}"`);
      await ctx.telegram.sendMessage(user.telegramId, `🎉 Ваш тариф изменен на "${plan.name}"`);

    } catch (error) {
      await ctx.reply('❌ Ошибка: ' + error.message);
    }
  }

  isAdmin(ctx) {
    return ctx.session.user && ctx.session.user.isAdmin;
  }
}

// ==================== ПРИЛОЖЕНИЕ ====================

class Application {
  constructor() {
    this.bot = new Telegraf(config.bot.token);
    this.app = express();
    
    this.stage = new Stage([addChannelScene, addPromptScene, tariffScene]);
    
    this.userController = new UserController();
    this.channelController = new ChannelController();
    this.promptController = new PromptController();
    this.adminController = new AdminController();
    
    this.setupExpress();
    this.setupBot();
  }

  setupExpress() {
    this.app.use(express.json());
    this.app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });
  }

  setupBot() {
    this.bot.use(session());
    this.bot.use(this.stage.middleware());
    this.bot.use(userAuth);

    // Команды
    this.bot.start((ctx) => this.userController.start(ctx));
    this.bot.help((ctx) => this.userController.help(ctx));

    // Главное меню
    this.bot.hears('📊 Мой кабинет', (ctx) => this.userController.showCabinet(ctx));
    this.bot.hears('ℹ️ Помощь', (ctx) => this.userController.help(ctx));
    this.bot.hears('💳 Тарифы', (ctx) => this.userController.showTariffs(ctx));
    this.bot.hears('👨‍💻 Поддержка', (ctx) => this.userController.showSupport(ctx));

    // Покупка тарифов
    this.bot.hears('💫 Купить Basic', (ctx) => this.userController.handleBuyBasic(ctx));
    this.bot.hears('💫 Купить Advanced', (ctx) => this.userController.handleBuyAdvanced(ctx));
    this.bot.hears('💫 Купить Professional', (ctx) => this.userController.handleBuyProfessional(ctx));

    // Мой кабинет
    this.bot.hears('📺 Мои каналы', (ctx) => this.userController.showChannels(ctx));
    this.bot.hears('🔍 Мои промты', (ctx) => this.userController.showPrompts(ctx));
    this.bot.hears('⏰ Расписание', (ctx) => ctx.reply('⏰ Раздел в разработке', Keyboards.backToCabinet()));
    this.bot.hears('💎 Мой тариф', (ctx) => this.userController.showSubscriptionStatus(ctx));

    // Управление
    this.bot.hears('➕ Добавить канал', (ctx) => this.channelController.startAddChannel(ctx));
    this.bot.hears('➕ Добавить промт', (ctx) => this.promptController.startAddPrompt(ctx));
    this.bot.hears('🗑️ Удалить канал', (ctx) => ctx.reply('ℹ️ Используйте кнопки в списке каналов'));
    this.bot.hears('🗑️ Удалить промт', (ctx) => ctx.reply('ℹ️ Используйте кнопки в списке промтов'));

    // Команды подписки
    this.bot.command(/^subscribe_(.+)$/, (ctx) => {
      const planCode = ctx.match[1];
      this.userController.handleSubscriptionCommand(ctx, planCode);
    });

    // Обработка callback для оплаты
    this.bot.action(/^pay_(.+)$/, (ctx) => {
      const planCode = ctx.match[1];
      this.userController.handlePaymentCallback(ctx, planCode);
    });

    // Админские команды - Управление тарифами
    this.bot.command('admin', (ctx) => this.adminController.showPanel(ctx));
    this.bot.command('setplan', (ctx) => this.adminController.setUserPlan(ctx));
    this.bot.hears('📈 Статистика', (ctx) => this.adminController.showStats(ctx));
    this.bot.hears('👥 Пользователи', (ctx) => this.adminController.showUsers(ctx));
    this.bot.hears('📢 Рассылка', (ctx) => this.adminController.broadcastMessage(ctx));
    this.bot.hears('⚙️ Тарифы', (ctx) => this.adminController.showTariffs(ctx));

    // Команды управления тарифами
    this.bot.command('create_tariff', (ctx) => this.adminController.createTariff(ctx));
    this.bot.command(/^edit_tariff (.+)$/, (ctx) => {
      const tariffId = ctx.match[1];
      this.adminController.editTariff(ctx, tariffId);
    });
    this.bot.command(/^toggle_tariff (.+)$/, (ctx) => {
      const tariffId = ctx.match[1];
      this.adminController.toggleTariff(ctx, tariffId);
    });
    this.bot.command(/^delete_tariff (.+)$/, (ctx) => {
      const tariffId = ctx.match[1];
      this.adminController.deleteTariff(ctx, tariffId);
    });
    this.bot.command(/^set_tariff_name (.+) (.+)$/, (ctx) => {
      const [, tariffId, newName] = ctx.match;
      this.adminController.setTariffName(ctx, tariffId, newName);
    });
    this.bot.command(/^set_tariff_price (.+) (.+)$/, (ctx) => {
      const [, tariffId, newPrice] = ctx.match;
      this.adminController.setTariffPrice(ctx, tariffId, newPrice);
    });
    this.bot.command(/^set_tariff_limits (.+) (.+) (.+)$/, (ctx) => {
      const [, tariffId, channels, prompts] = ctx.match;
      this.adminController.setTariffLimits(ctx, tariffId, channels, prompts);
    });

    // Навигация
    this.bot.hears('🔙 Главное меню', (ctx) => this.userController.start(ctx));
    this.bot.hears('🔙 Мой кабинет', (ctx) => this.userController.showCabinet(ctx));
    this.bot.hears('🔙 Админ-панель', (ctx) => this.adminController.showPanel(ctx));
    this.bot.hears('🔙 Управление тарифами', (ctx) => this.adminController.showTariffs(ctx));
    this.bot.hears('❌ Отмена', (ctx) => {
      if (ctx.session.waitingForBroadcast) delete ctx.session.waitingForBroadcast;
      if (ctx.session.selectedPlan) delete ctx.session.selectedPlan;
      if (ctx.scene) return ctx.scene.leave();
      ctx.reply('Действие отменено.', Keyboards.mainMenu());
    });

    // Обработка платежей Stars
    this.bot.on('message', (ctx) => {
      if (ctx.session.waitingForBroadcast) {
        return this.adminController.handleBroadcastMessage(ctx);
      }
      
      if (ctx.message && ctx.message.star) {
        const starsAmount = ctx.message.star;
        this.userController.processStarsPayment(ctx, starsAmount);
      }
    });

    this.bot.catch((error, ctx) => {
      console.error('Bot error:', error);
      ctx.reply('❌ Произошла ошибка.');
    });
  }

  async start() {
    try {
      await connectDB();
      console.log('✅ Database connected');

      await this.bot.launch();
      console.log('✅ Bot started');

      this.app.listen(config.server.port, () => {
        console.log(`✅ Express on port ${config.server.port}`);
      });

      console.log('🚀 Application started with full tariff management!');
      console.log('💫 Payment system: Telegram Stars');
      console.log('⚙️ Admin tariff commands available');

    } catch (error) {
      console.error('❌ Startup error:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    console.log('🛑 Shutting down...');
    this.bot.stop();
    process.exit(0);
  }
}

// Запуск приложения
const app = new Application();
app.start();

module.exports = app;