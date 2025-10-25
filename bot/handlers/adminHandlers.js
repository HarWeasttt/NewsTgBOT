const User = require('../../models/User');
const Channel = require('../../models/Channel');
const Transaction = require('../../models/Transaction');
const UserService = require('../../services/UserService');
const AIService = require('../../services/AIService');
const { adminMainKeyboard } = require('../keyboards/keyboards');
const { BOT_CONFIG, SUBSCRIPTION_PLANS } = require('../../config');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

function setupAdminHandlers(bot) {
  // Обработка кнопок админ-панели
  bot.hears('📊 Статистика', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      return ctx.reply('❌ Доступ запрещен');
    }

    try {
      const userStats = await UserService.getUserStats();
      const totalChannels = await Channel.countDocuments();
      const aiStats = AIService.getUsageStats();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const usersWithPosts = await User.countDocuments({
        'limits.lastReset': { $gte: today },
        'limits.postsToday': { $gt: 0 }
      });

      const message = `📊 Статистика системы:

👥 Пользователи:
• Всего: ${userStats.totalUsers}
• Активные подписки: ${userStats.activeSubscriptions}
• Пробные периоды: ${userStats.trialUsers}
• Опубликовали сегодня: ${usersWithPosts}

📺 Каналы:
• Всего подключено: ${totalChannels}

🤖 AI:
• Всего запросов: ${aiStats.totalRequests}
• Запросов сегодня: ${aiStats.todayRequests}

💫 Система:
• Админов: ${BOT_CONFIG.ADMIN_IDS.length}
• Бот: @${ctx.botInfo.username}`;

      await ctx.reply(message);
    } catch (error) {
      console.error('Admin stats error:', error);
      await ctx.reply('❌ Ошибка при получении статистики');
    }
  });
  // Админское удаление канала
  bot.action(/admin_delete_channel_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId).populate('owner');

    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    const message = `🗑️ Админское удаление канала\n\n` +
      `Канал: ${channel.title}\n` +
      `Владелец: ${channel.owner.firstName}${channel.owner.username ? ` (@${channel.owner.username})` : ''}\n` +
      `RSS источников: ${channel.rssSources.length}\n` +
      `Постов: ${channel.statistics?.totalPosts || 0}\n\n` +
      `⚠️ Это действие нельзя отменить!\n` +
      `Вы уверены, что хотите удалить канал?`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Да, удалить',
              callback_data: `admin_confirm_delete_channel_${channel._id}`
            },
            {
              text: '❌ Отмена',
              callback_data: 'admin_back_to_panel'
            }
          ]
        ]
      }
    });
  });
  bot.hears('📊 Каналы', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) return;

    try {
      const channels = await Channel.find()
        .populate('owner', 'firstName username')
        .sort({ createdAt: -1 })
        .limit(20);

      if (channels.length === 0) {
        await ctx.reply('❌ В системе нет каналов.');
        return;
      }

      let message = '📊 Управление каналами (последние 20):\n\n';
      const keyboard = [];

      channels.forEach((channel, index) => {
        message += `${index + 1}. ${channel.title}\n`;
        message += `   Владелец: ${channel.owner.firstName}${channel.owner.username ? ` (@${channel.owner.username})` : ''}\n`;
        message += `   RSS: ${channel.rssSources.length} | Постов: ${channel.statistics?.totalPosts || 0}\n`;
        message += `   Создан: ${channel.createdAt.toLocaleDateString('ru-RU')}\n\n`;

        keyboard.push([
          {
            text: `👁️ ${channel.title.substring(0, 15)}`,
            callback_data: `admin_view_channel_${channel._id}`
          },
          {
            text: '🗑️',
            callback_data: `admin_delete_channel_${channel._id}`
          }
        ]);
      });

      keyboard.push([{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]);

      await ctx.reply(message, {
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error) {
      console.error('Admin manage channels error:', error);
      await ctx.reply('❌ Ошибка при получении каналов');
    }
  });
  // Подтверждение админского удаления
  bot.action(/admin_confirm_delete_channel_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    const channelId = ctx.match[1];

    try {
      const channel = await Channel.findById(channelId).populate('owner');

      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const channelInfo = {
        title: channel.title,
        owner: `${channel.owner.firstName}${channel.owner.username ? ` (@${channel.owner.username})` : ''}`,
        rssCount: channel.rssSources.length,
        postsCount: channel.statistics?.totalPosts || 0
      };

      // Удаляем канал
      await Channel.findByIdAndDelete(channelId);

      await ctx.answerCbQuery('✅ Канал удален');

      const message = `✅ Канал успешно удален администратором!\n\n` +
        `📊 Информация:\n` +
        `• Канал: ${channelInfo.title}\n` +
        `• Владелец: ${channelInfo.owner}\n` +
        `• RSS источников: ${channelInfo.rssCount}\n` +
        `• Постов всего: ${channelInfo.postsCount}\n\n` +
        `🗑️ Канал полностью удален из системы.`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]
          ]
        }
      });

    } catch (error) {
      console.error('Admin delete channel error:', error);
      await ctx.answerCbQuery('❌ Ошибка при удалении канала');
      await ctx.editMessageText('❌ Произошла ошибка при удалении канала.');
    }
  });

  // Поиск каналов для админского удаления
  bot.action('admin_manage_channels', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const channels = await Channel.find()
        .populate('owner', 'firstName username')
        .sort({ createdAt: -1 })
        .limit(20);

      if (channels.length === 0) {
        await ctx.editMessageText('❌ В системе нет каналов.');
        return;
      }

      let message = '📊 Управление каналами (последние 20):\n\n';
      const keyboard = [];

      channels.forEach((channel, index) => {
        message += `${index + 1}. ${channel.title}\n`;
        message += `   Владелец: ${channel.owner.firstName}${channel.owner.username ? ` (@${channel.owner.username})` : ''}\n`;
        message += `   RSS: ${channel.rssSources.length} | Постов: ${channel.statistics?.totalPosts || 0}\n`;
        message += `   Создан: ${channel.createdAt.toLocaleDateString('ru-RU')}\n\n`;

        keyboard.push([
          {
            text: `👁️ ${channel.title.substring(0, 15)}`,
            callback_data: `admin_view_channel_${channel._id}`
          },
          {
            text: '🗑️',
            callback_data: `admin_delete_channel_${channel._id}`
          }
        ]);
      });

      keyboard.push([{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]);

      await ctx.editMessageText(message, {
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error) {
      console.error('Admin manage channels error:', error);
      await ctx.answerCbQuery('❌ Ошибка при получении каналов');
    }
  });

  // Просмотр информации о канале для админа
  bot.action(/admin_view_channel_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId).populate('owner');

    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    const message = `📊 Информация о канале:\n\n` +
      `🔸 Название: ${channel.title}\n` +
      `👤 Владелец: ${channel.owner.firstName}${channel.owner.username ? ` (@${channel.owner.username})` : ''}\n` +
      `🆔 ID владельца: ${channel.owner.telegramId}\n` +
      `🔧 Режим: ${channel.settings.mode}\n` +
      `📰 RSS источников: ${channel.rssSources.length}\n` +
      `🚀 Автопостинг: ${channel.settings.autoPublish ? '✅' : '❌'}\n` +
      `📈 Постов всего: ${channel.statistics?.totalPosts || 0}\n` +
      `📅 Создан: ${channel.createdAt.toLocaleDateString('ru-RU')}\n\n` +
      `RSS источники:\n`;

    if (channel.rssSources.length === 0) {
      message += '❌ Нет RSS источников\n';
    } else {
      channel.rssSources.forEach((source, index) => {
        message += `${index + 1}. ${source.url}\n`;
      });
    }

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🗑️ Удалить канал', callback_data: `admin_delete_channel_${channel._id}` },
            { text: '👥 К каналам', callback_data: 'admin_manage_channels' }
          ],
          [
            { text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }
          ]
        ]
      }
    });
  });
  bot.hears('👥 Пользователи', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) return;

    try {
      const users = await User.find().sort({ createdAt: -1 }).limit(10);

      let message = '👥 Последние 10 пользователей:\n\n';

      users.forEach((user, index) => {
        message += `${index + 1}. ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}\n`;
        message += `   👤 ${user.username ? `@${user.username}` : 'без username'}\n`;
        message += `   🆔 ID: ${user.telegramId}\n`;
        message += `   💎 Тариф: ${SUBSCRIPTION_PLANS[user.subscription.plan]?.name || user.subscription.plan}\n`;
        message += `   🎯 Пробный: ${user.subscription.isTrial ? '✅' : '❌'}\n`;
        message += `   🔒 Статус: ${user.isBlocked ? '❌ Заблокирован' : '✅ Активен'}\n`;
        message += `   📅 Регистрация: ${user.createdAt.toLocaleDateString('ru-RU')}\n\n`;
      });

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 Найти пользователя', callback_data: 'admin_find_user' }],
            [{ text: '📋 Все пользователи (50)', callback_data: 'admin_all_users' }],
            [{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]
          ]
        }
      });
    } catch (error) {
      console.error('Admin users error:', error);
      await ctx.reply('❌ Ошибка при получении списка пользователей');
    }
  });

  bot.hears('💰 Финансы', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) return;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);

      const [todayStats, weekStats, monthStats, planStats] = await Promise.all([
        Transaction.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: today } } },
          { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        Transaction.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: weekAgo } } },
          { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        Transaction.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: monthAgo } } },
          { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        Transaction.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: monthAgo } } },
          { $group: { _id: '$plan', revenue: { $sum: '$amount' }, count: { $sum: 1 } } }
        ])
      ]);

      const message = `💰 Финансовая статистика:

📅 Сегодня:
• Транзакций: ${todayStats[0]?.count || 0}
• Выручка: ${todayStats[0]?.revenue || 0} звезд

📅 За 7 дней:
• Транзакций: ${weekStats[0]?.count || 0}
• Выручка: ${weekStats[0]?.revenue || 0} звезд

📅 За 30 дней:
• Транзакций: ${monthStats[0]?.count || 0}
• Выручка: ${monthStats[0]?.revenue || 0} звезд

💎 Распределение по тарифам:`;

      let planMessage = '';
      planStats.forEach(plan => {
        planMessage += `\n• ${plan._id}: ${plan.count} транз., ${plan.revenue} звезд`;
      });

      await ctx.reply(message + (planMessage || '\n• Нет данных'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📈 История транзакций', callback_data: 'admin_transactions' }],
            [{ text: '📊 Экспорт в CSV', callback_data: 'admin_export_finance' }],
            [{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]
          ]
        }
      });
    } catch (error) {
      console.error('Admin finance error:', error);
      await ctx.reply('❌ Ошибка при получении финансовой статистики');
    }
  });

  bot.hears('🎯 Тарифы', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) return;

    try {
      // Статистика по пользователям на каждом тарифе
      const userStats = await User.aggregate([
        {
          $group: {
            _id: '$subscription.plan',
            count: { $sum: 1 },
            active: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$subscription.plan', 'FREE'] },
                      { $gt: ['$subscription.endDate', new Date()] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      const planStatsMap = {};
      userStats.forEach(stat => {
        planStatsMap[stat._id] = stat;
      });

      let message = '💎 Текущие тарифные планы:\n\n';

      Object.entries(SUBSCRIPTION_PLANS).forEach(([key, plan]) => {
        const stats = planStatsMap[key] || { count: 0, active: 0 };

        message += `🔸 *${plan.name}*\n`;
        message += `   📺 Каналов: ${plan.channels}\n`;
        message += `   📝 Постов/день: ${plan.postsPerDay}\n`;
        message += `   🤖 AI: ${plan.aiAccess ? '✅' : '❌'}\n`;
        message += `   💰 Цена: ${plan.price > 0 ? `${plan.price} звезд` : 'Бесплатно'}\n`;
        message += `   👥 Пользователей: ${stats.count} (активных: ${stats.active})\n\n`;
      });

      message += '💡 Управление тарифами:';

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✏️ Изменить тариф', callback_data: 'admin_edit_plan' },
              { text: '🆕 Создать тариф', callback_data: 'admin_create_plan' }
            ],
            [
              { text: '📊 Статистика', callback_data: 'admin_plan_stats' },
              { text: '🔄 Сбросить', callback_data: 'admin_reset_plans' }
            ],
            [
              { text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Admin plans error:', error);
      await ctx.reply('❌ Ошибка при получении информации о тарифах');
    }
  });

  bot.hears('🤖 AI Настройки', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) return;

    try {
      const aiStats = AIService.getUsageStats();

      const message = `🤖 Настройки и статистика AI:

📊 Статистика использования:
• Всего запросов: ${aiStats.totalRequests}
• Запросов сегодня: ${aiStats.todayRequests}
• Общие затраты: ${aiStats.totalCost || 0} USD

⚙️ Текущие настройки:
• Модель: GPT-4
• API ключ: ${process.env.OPENAI_API_KEY ? '✅ Установлен' : '❌ Отсутствует'}

💡 Доступные действия:`;

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Сбросить статистику', callback_data: 'admin_reset_ai_stats' }],
            [{ text: '📊 Детальная статистика', callback_data: 'admin_ai_detailed_stats' }],
            [{ text: '🔧 Изменить API ключ', callback_data: 'admin_change_ai_key' }],
            [{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]
          ]
        }
      });
    } catch (error) {
      console.error('Admin AI settings error:', error);
      await ctx.reply('❌ Ошибка при получении настроек AI');
    }
  });



// Обработчик кнопки "Тарифы" для пользователей
bot.hears('💎 Тарифы', async (ctx) => {
    let message = `💎 Доступные тарифы:\n\n`;

    Object.entries(SUBSCRIPTION_PLANS).forEach(([key, plan]) => {
        // ПОКАЗЫВАЕМ ВСЕ ТАРИФЫ, КРОМЕ FREE ЕСЛИ НЕ ПРОБНЫЙ ПЕРИОД
        if (key !== 'FREE' || ctx.user.subscription.isTrial) {
            message += `🔸 *${plan.name}*\n`;
            message += `   📺 Каналов: ${plan.channels}\n`;
            message += `   📝 Постов/день: ${plan.postsPerDay}\n`;
            message += `   🤖 AI: ${plan.aiAccess ? '✅' : '❌'}\n`;
            message += `   ⏰ Планировщик: ${plan.scheduling ? '✅' : '❌'}\n`;
            message += `   💰 Цена: ${plan.price > 0 ? `${plan.price} ⭐/месяц` : 'Бесплатно'}\n\n`;
        }
    });

    if (ctx.user.subscription.isTrial) {
        message += `🎁 У вас активен пробный период до ${new Date(ctx.user.subscription.trialEndDate).toLocaleDateString('ru-RU')}\n\n`;
    }

    message += `Выберите тариф для покупки:`;

    // СОЗДАЕМ КНОПКИ ТОЛЬКО ДЛЯ ПЛАТНЫХ ТАРИФОВ
    const paidPlans = Object.entries(SUBSCRIPTION_PLANS)
        .filter(([key, plan]) => key !== 'FREE' && plan.price > 0);

    const keyboard = [
        ...paidPlans.map(([key, plan]) => [
            { 
                text: `${'⭐'.repeat(Math.min(plan.price / 100, 3))} ${plan.name}`, 
                callback_data: `user_select_plan_${key}`
            }
        ]),
        [
            { text: '💰 Как получить звезды', callback_data: 'how_to_get_stars' },
            { text: '📊 Моя подписка', callback_data: 'my_subscription' }
        ]
    ];

    await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
});

// Выбор тарифа пользователем
bot.action(/user_select_plan_(.+)/, async (ctx) => {
    const planName = ctx.match[1];
    const plan = SUBSCRIPTION_PLANS[planName];

    console.log('🔍 Выбор тарифа:', { planName, plan }); // ДЛЯ ОТЛАДКИ

    // ИСПРАВЛЕННОЕ УСЛОВИЕ ПРОВЕРКИ
    if (!plan) {
        console.log('❌ Тариф не найден:', planName);
        await ctx.answerCbQuery('❌ Тариф не найден');
        return;
    }

    if (plan.price <= 0) {
        console.log('❌ Тариф бесплатный:', planName);
        await ctx.answerCbQuery('❌ Этот тариф бесплатный');
        return;
    }

    // Периоды подписки (месяцы) и коэффициенты скидки
    const subscriptionPeriods = [
        { months: 1, discount: 0, label: '1 месяц', price: plan.price },
        { months: 3, discount: 10, label: '3 месяца', price: Math.floor(plan.price * 3 * 0.9) },
        { months: 6, discount: 20, label: '6 месяцев', price: Math.floor(plan.price * 6 * 0.8) },
        { months: 12, discount: 30, label: '1 год', price: Math.floor(plan.price * 12 * 0.7) }
    ];

    let message = `🛒 *Выбор тарифа: ${plan.name}*\n\n`;
    message += `*Включено:*\n`;
    message += `• ${plan.channels} каналов\n`;
    message += `• ${plan.postsPerDay} постов в день\n`;
    message += `• AI-генерация: ${plan.aiAccess ? '✅' : '❌'}\n`;
    message += `• Планировщик: ${plan.scheduling ? '✅' : '❌'}\n\n`;
    message += `*Выберите период подписки:*\n\n`;

    subscriptionPeriods.forEach(period => {
        const savings = period.discount > 0 ? ` (экономия ${period.discount}%)` : '';
        const originalPrice = plan.price * period.months;
        const discountInfo = period.discount > 0 ? `\n   Было: ${originalPrice} ⭐` : '';
        message += `🔸 ${period.label}: ${period.price} ⭐${savings}${discountInfo}\n`;
    });

    await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                ...subscriptionPeriods.map(period => [
                    {
                        text: `${period.label} - ${period.price} ⭐${period.discount > 0 ? ` 🎁` : ''}`,
                        callback_data: `user_buy_plan_${planName}_${period.months}`
                    }
                ]),
                [
                    { text: '🔙 Назад к тарифам', callback_data: 'back_to_tariffs' },
                    { text: '💰 Получить звезды', callback_data: 'how_to_get_stars' }
                ]
            ]
        }
    });

    await ctx.answerCbQuery();
});

// Покупка тарифа с выбранным периодом
bot.action(/user_buy_plan_(.+)_(\d+)/, async (ctx) => {
    const planName = ctx.match[1];
    const months = parseInt(ctx.match[2]);
    const plan = SUBSCRIPTION_PLANS[planName];

    console.log('💰 Покупка тарифа:', { planName, months, plan });

    // ПРОВЕРЯЕМ ЧТО ТАРИФ СУЩЕСТВУЕТ И ПЛАТНЫЙ
    if (!plan || plan.price <= 0) {
        await ctx.answerCbQuery('❌ Ошибка: тариф не найден');
        return;
    }

    // Находим выбранный период
    const subscriptionPeriods = [
        { months: 1, discount: 0, price: plan.price },
        { months: 3, discount: 10, price: Math.floor(plan.price * 3 * 0.9) },
        { months: 6, discount: 20, price: Math.floor(plan.price * 6 * 0.8) },
        { months: 12, discount: 30, price: Math.floor(plan.price * 12 * 0.7) }
    ];

    const selectedPeriod = subscriptionPeriods.find(p => p.months === months);
    if (!selectedPeriod) {
        await ctx.answerCbQuery('❌ Ошибка: период не найден');
        return;
    }

    const totalPrice = selectedPeriod.price;

    // Создаем инвойс для оплаты звездами
    const payload = JSON.stringify({
        plan: planName,
        months: months,
        userId: ctx.user._id.toString(),
        timestamp: Date.now()
    });

    try {
        // ДЛЯ TELEGRAM STARS - правильный формат
        const prices = [{
            label: `Подписка ${plan.name}`,
            amount: totalPrice * 100 // Для Stars нужно умножать на 100!
        }];

        // Для Stars используем специальные настройки чаевых
        const maxTipAmount = totalPrice * 100; // Максимальные чаевые (в формате Stars)
        
        // Предлагаемые суммы чаевых (в звездах)
        const suggestedTips = [100, 200, 500]; // 1, 2, 5 звезд в правильном формате

        await ctx.replyWithInvoice({
            title: `Тариф "${plan.name}" - ${months} ${getMonthWord(months)}`,
            description: `Подписка на ${months} ${getMonthWord(months)}\n\nВключено:\n• ${plan.channels} каналов\n• ${plan.postsPerDay} постов в день\n• AI-генерация: ${plan.aiAccess ? 'Да' : 'Нет'}\n• Планировщик: ${plan.scheduling ? 'Да' : 'Нет'}\n${selectedPeriod.discount > 0 ? `• Скидка: ${selectedPeriod.discount}%` : ''}\n\n💫 Оплата Telegram Stars`,
            payload: payload,
            currency: 'XTR', // Telegram Stars
            prices: prices,
            provider_token: '', // Для Stars может быть пустым
            photo_url: 'https://via.placeholder.com/500x300/4F46E5/FFFFFF?text=Content+Manager+Bot',
            need_name: false,
            need_phone_number: false,
            need_email: false,
            need_shipping_address: false,
            is_flexible: false,
            suggested_tip_amounts: suggestedTips // Предлагаемые чаевые
        });

        await ctx.answerCbQuery();
    } catch (error) {
        console.error('❌ Ошибка создания инвойса:', error);
        
        // ПРОБУЕМ АЛЬТЕРНАТИВНЫЙ ВАРИАНТ БЕЗ ЧАЕВЫХ
        try {
            await ctx.replyWithInvoice({
                title: `Тариф "${plan.name}" - ${months} ${getMonthWord(months)}`,
                description: `Подписка на ${months} ${getMonthWord(months)}\n\nВключено:\n• ${plan.channels} каналов\n• ${plan.postsPerDay} постов в день\n• AI-генерация: ${plan.aiAccess ? 'Да' : 'Нет'}\n• Планировщик: ${plan.scheduling ? 'Да' : 'Нет'}`,
                payload: payload,
                currency: 'XTR',
                prices: [{
                    label: `Подписка ${plan.name}`,
                    amount: 1
                }],
                provider_token: '',
                photo_url: 'https://via.placeholder.com/500x300/4F46E5/FFFFFF?text=Content+Manager+Bot',
                need_name: false,
                need_phone_number: false,
                need_email: false,
                need_shipping_address: false,
                is_flexible: false
            });
            
            await ctx.answerCbQuery();
        } catch (secondError) {
            console.error('❌ Ошибка при втором варианте инвойса:', secondError);
            await ctx.answerCbQuery('❌ Ошибка при создании платежа');
            await ctx.reply('❌ Произошла ошибка при создании платежа. Попробуйте позже.');
        }
    }
});

// Функция для правильного склонения месяцев
function getMonthWord(months) {
    if (months === 1) return 'месяц';
    if (months >= 2 && months <= 4) return 'месяца';
    return 'месяцев';
}

// Обработка успешных платежей (pre-checkout)
bot.on('pre_checkout_query', async (ctx) => {
    console.log('🔔 Pre-checkout query:', ctx.preCheckoutQuery);
    
    try {
        const payload = JSON.parse(ctx.preCheckoutQuery.invoice_payload);
        const plan = SUBSCRIPTION_PLANS[payload.plan];
        
        if (!plan) {
            await ctx.answerPreCheckoutQuery(false, "Тариф не найден");
            return;
        }
        
        // Проверяем пользователя
        const user = await User.findById(payload.userId);
        if (!user) {
            await ctx.answerPreCheckoutQuery(false, "Пользователь не найден");
            return;
        }
        
        // Все проверки пройдены
        await ctx.answerPreCheckoutQuery(true);
        
    } catch (error) {
        console.error('❌ Pre-checkout error:', error);
        await ctx.answerPreCheckoutQuery(false, "Ошибка обработки платежа");
    }
});

// Обработка успешных платежей
bot.on('successful_payment', async (ctx) => {
    console.log('💰 Successful payment:', ctx.message.successful_payment);
    
    try {
        const payment = ctx.message.successful_payment;
        const payload = JSON.parse(payment.invoice_payload);
        
        const { plan: planName, months, userId } = payload;
        const plan = SUBSCRIPTION_PLANS[planName];
        
        if (!plan) {
            console.error('❌ Plan not found:', planName);
            await ctx.reply('❌ Ошибка: тариф не найден. Обратитесь в поддержку.');
            return;
        }
        
        // Находим пользователя
        const user = await User.findById(userId);
        if (!user) {
            console.error('❌ User not found:', userId);
            await ctx.reply('❌ Ошибка: пользователь не найден. Обратитесь в поддержку.');
            return;
        }
        
        // Рассчитываем дату окончания подписки
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + months);
        
        // ОБНОВЛЯЕМ ПОДПИСКУ ПОЛЬЗОВАТЕЛЯ - ПРАВИЛЬНЫЕ ПОЛЯ
        user.subscription.plan = planName;
        user.subscription.startDate = startDate;
        user.subscription.endDate = endDate;
        user.subscription.isTrial = false;
        user.subscription.isActive = true;
        
        // ОБНОВЛЯЕМ ЛИМИТЫ - ПРАВИЛЬНЫЕ ПОЛЯ ИЗ ВАШЕЙ МОДЕЛИ
        user.limits.channels = plan.channels; // Максимальное количество каналов
        user.limits.postsPerDay = plan.postsPerDay; // Лимит постов в день
        user.limits.aiAccess = plan.aiAccess;
        user.limits.scheduling = plan.scheduling;
        
        // Если нужно сбросить счетчик постов за сегодня при смене тарифа
        user.limits.postsToday = 0;
        user.limits.lastReset = new Date();
        
        // Сохраняем пользователя
        await user.save();
        
        // Создаем запись о транзакции
        const transaction = new Transaction({
            userId: user._id,
            telegramId: user.telegramId,
            plan: planName,
            months: months,
            amount: payment.total_amount / 100, // Конвертируем обратно в звезды
            currency: payment.currency,
            providerPaymentChargeId: payment.telegram_payment_charge_id,
            status: 'completed'
        });
        
        await transaction.save();
        
        // Отправляем подтверждение пользователю
        const message = `🎉 *Поздравляем! Подписка активирована!*

✅ Тариф: *${plan.name}*
⏱ Срок: *${months} ${getMonthWord(months)}*
📅 До: *${endDate.toLocaleDateString('ru-RU')}*

📊 Ваши новые возможности:
• Каналов: *${user.limits.channels}* (было обновлено)
• Постов в день: *${user.limits.postsPerDay}* (было обновлено)
• AI-генерация: *${user.limits.aiAccess ? '✅ Доступна' : '❌ Недоступна'}*
• Планировщик: *${user.limits.scheduling ? '✅ Доступен' : '❌ Недоступен'}*

💫 Спасибо за покупку! Теперь вы можете полноценно использовать все функции бота.`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
        
        console.log(`✅ Подписка активирована для пользователя ${user.telegramId} на тариф ${planName}`);
        console.log(`📊 Новые лимиты: ${user.limits.channels} каналов, ${user.limits.postsPerDay} постов/день`);
        
    } catch (error) {
        console.error('❌ Payment processing error:', error);
        await ctx.reply('❌ Произошла ошибка при активации подписки. Обратитесь в поддержку.');
    }
});
// // Настройка тем AI
//   bot.action(/ai_topics_setup_(.+)/, async (ctx) => {
//     const channelId = ctx.match[1];
//     const channel = await Channel.findById(channelId);

//     const message = `📝 Настройка тем AI для: ${channel.title}\n\n` +
//       `Текущие темы: ${channel.aiSettings.topics.join(', ') || 'не заданы'}\n\n` +
//       `Отправьте список тем через запятую.\n` +
//       `Пример: "технологии, программирование, IT новости"`;

//     await ctx.editMessageText(message, {
//       reply_markup: {
//         inline_keyboard: [
//           [
//             { text: '❌ Отмена', callback_data: `ai_settings_${channel._id}` }
//           ]
//         ]
//       }
//     });

//     // Сохраняем ID канала в сессии для последующей обработки
//     ctx.session.pendingAiTopics = channelId;
//   });

//   // Запуск сцены генерации AI поста
//   bot.action(/ai_generate_(.+)/, async (ctx) => {
//     const channelId = ctx.match[1];

//     try {
//       const user = await UserService.getOrCreateUser(ctx.from);

//       if (!user.subscription.isTrial && !user.subscription.aiAccess) {
//         await ctx.answerCbQuery('❌ AI-генерация доступна только на платных тарифах');
//         return;
//       }

//       const canPost = await UserService.canUserPost(user);
//       if (!canPost) {
//         await ctx.answerCbQuery('❌ Вы достигли дневного лимита постов');
//         return;
//       }

//       await ctx.answerCbQuery();
//       await ctx.scene.enter('ai-post-scene', {
//         channelId: channelId,
//         user: user
//       });
//     } catch (error) {
//       console.error('Error entering AI scene:', error);
//       await ctx.answerCbQuery('❌ Ошибка при запуске генерации');
//     }
//   });
// Обработка отмененных платежей (опционально)
bot.on('shipping_query', async (ctx) => {
    await ctx.answerShippingQuery(false, 'Доставка не требуется', []);
});

// Также добавьте обработку ошибок платежей
bot.on('shipping_query_error', async (ctx) => {
    console.error('Shipping query error:', ctx.shippingQuery);
});

// Добавьте эту функцию для форматирования даты
function formatDate(date) {
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}


  bot.hears('⚙️ Система', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) return;

    try {
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = Math.floor(uptime % 60);

      const message = `⚙️ Системная информация:

🖥 Сервер:
• Память: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB
• Heap: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
• Время работы: ${hours}ч ${minutes}м ${seconds}с

📊 База данных:
• MongoDB: ✅ Подключена
• Redis: ${process.env.REDIS_URL ? '✅ Настроен' : '❌ Не настроен'}

🤖 Бот:
• Username: @${ctx.botInfo.username}
• ID: ${ctx.botInfo.id}
• Админов: ${BOT_CONFIG.ADMIN_IDS.length}`;

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Перезапустить бота', callback_data: 'admin_restart_bot' }],
            [{ text: '📋 Логи системы', callback_data: 'admin_system_logs' }],
            [{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]
          ]
        }
      });
    } catch (error) {
      console.error('Admin system error:', error);
      await ctx.reply('❌ Ошибка при получении системной информации');
    }
  });

  bot.hears('🔙 В главное меню', async (ctx) => {
    const { userMainKeyboard } = require('../keyboards/keyboards');
    await ctx.reply('Главное меню:', {
      reply_markup: userMainKeyboard
    });
  });
}

module.exports = setupAdminHandlers;