const User = require('../../models/User');
const Channel = require('../../models/Channel');
const Transaction = require('../../models/Transaction');
const LogService = require('../../services/LogService');
const UserService = require('../../services/UserService');
const AIService = require('../../services/AIService');
const ConfigService = require('../../services/ConfigService');
const BotManager = require('../../services/BotManager');
const AutoPostService = require('../../services/AutoPostService');
const { userMainKeyboard, channelDetailKeyboard, deleteConfirmKeyboard, rssManagementKeyboard, rssDeleteSelectionKeyboard, adminMainKeyboard, postTypesKeyboard } = require('../keyboards/keyboards');
const { BOT_CONFIG, SUBSCRIPTION_PLANS, loadCustomPlans, POST_TYPES } = require('../../config');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

// const User = require('../../models/User');
// const Channel = require('../../models/Channel');
// const Transaction = require('../../models/Transaction');
// const UserService = require('../../services/UserService');
// const AIService = require('../../services/AIService');
// const { adminMainKeyboard } = require('../keyboards/keyboards');
// const { BOT_CONFIG, SUBSCRIPTION_PLANS } = require('../../config');
// const { createObjectCsvWriter } = require('csv-writer');
// const fs = require('fs');
// const path = require('path');
// const User = require('../../models/User');
// const Channel = require('../../models/Channel');
// const Transaction = require('../../models/Transaction');
// const LogService = require('../../services/LogService');
// const UserService = require('../../services/UserService');
// const AIService = require('../../services/AIService');
// const ConfigService = require('../../services/ConfigService');
// const BotManager = require('../../services/BotManager');
// const { rssSetupScene, quickRssSetupScene } = require('../scenes/rssSetupScene');
// const { userMainKeyboard, channelDetailKeyboard,
//   deleteConfirmKeyboard,
//   rssManagementKeyboard,
//   rssDeleteSelectionKeyboard } = require('../keyboards/keyboards');
// const { BOT_CONFIG, SUBSCRIPTION_PLANS, loadCustomPlans } = require('../../config');
// const { createObjectCsvWriter } = require('csv-writer');
// const fs = require('fs');
// const path = require('path');
// const Channel = require('../../models/Channel');
// const UserService = require('../../services/UserService');
// const User = require('../../models/User');
// const Channel = require('../../models/Channel');
// const UserService = require('../../services/UserService');
// const AIService = require('../../services/AIService');
// const { userMainKeyboard, aiTonesKeyboard, postTypesKeyboard, adminMainKeyboard } = require('../keyboards/keyboards');
// const { BOT_CONFIG, SUBSCRIPTION_PLANS, POST_TYPES, AI_PROMPTS } = require('../../config');


function setupAllHendlers(bot) {
  // Команда /admin - должна обрабатываться ПЕРВОЙ
  bot.command('admin', async (ctx) => {
    console.log('🔐 Admin command from:', ctx.from.id, ctx.from.username);

    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      console.log('❌ Access denied for:', ctx.from.id);
      return ctx.reply('❌ Доступ запрещен. У вас нет прав администратора.');
    }

    console.log('✅ Admin access granted for:', ctx.from.username || ctx.from.first_name);

    await ctx.reply('🛠 Панель администратора', {
      reply_markup: adminMainKeyboard
    });
  });

  // Команда /start
  bot.start(async (ctx) => {
    const user = await UserService.getOrCreateUser(ctx.from);

    const welcomeText = `🤖 Добро пожаловать в Content Manager Bot!

✨ Возможности:
• Автопостинг из RSS-лент
• AI-генерация контента
• Планирование публикаций
• Управление несколькими каналами

🎯 Ваш пробный период активен до: ${new Date(user.subscription.trialEndDate).toLocaleDateString('ru-RU')}

Используйте меню для управления ботом!`;

    await ctx.reply(welcomeText, {
      reply_markup: userMainKeyboard
    });
  });

















  // Команда /help
  bot.help((ctx) => {
    
    ctx.reply(`📖 Справка по боту:

🔹 *Управление каналами* - добавьте бота как администратора в ваш канал
🔹 *RSS ленты* - настройте автоматический постинг новостей
🔹 *AI Генерация* - создавайте уникальный контент с помощью нейросети
🔹 *Планировщик* - настройте расписание публикаций
🔹 *Тарифы* - выберите подходящий план подписки

Для начала работы добавьте бота в ваш канал как администратора!`, {
      parse_mode: 'Markdown',
      reply_markup: userMainKeyboard
    });
  });

  // Помощь
  bot.hears('🆘 Помощь', (ctx) => {
    ctx.reply(`📖 Справка по боту:

🔹 *Управление каналами* - добавьте бота как администратора в ваш канал
🔹 *RSS ленты* - настройте автоматический постинг новостей
🔹 *AI Генерация* - создавайте уникальный контент с помощью нейросети
🔹 *Планировщик* - настройте расписание публикаций
🔹 *Тарифы* - выберите подходящий план подписки

Для начала работы добавьте бота в ваш канал как администратора!`, { parse_mode: 'Markdown' });
  });

  // Мои каналы
  bot.hears('📊 Мои каналы', async (ctx) => {
    const channels = await Channel.find({ owner: ctx.user._id });

    if (channels.length === 0) {
      return ctx.reply(`📭 У вас нет подключенных каналов.

Чтобы добавить канал:
1. Добавьте @${ctx.botInfo.username} как администратора в ваш канал
2. Дайте права на отправку сообщений
3. Перешлите любое сообщение из канала в этот чат`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Добавить канал', callback_data: 'add_channel' }],
            [{ text: '🔙 Назад', callback_data: 'main_menu' }]
          ]
        }
      });
    }

    let message = `📊 Ваши каналы (${channels.length}/${ctx.user.limits.channels}):\n\n`;

    const keyboard = [];

    channels.forEach(channel => {
      // Безопасная проверка расписания (теперь внутри settings)
      const schedule = channel.settings?.schedule || {};
      const scheduleStatus = schedule.enabled ?
        `⏰ ${(schedule.times || []).length} раз в день` : '❌ Выкл';

      const mode = channel.settings?.mode || 'combined';
      const rssCount = channel.rssSources?.length || 0;

      message += `🔸 ${channel.title}\n`;
      message += `   Режим: ${mode}\n`;
      message += `   RSS: ${rssCount} источников\n`;
      message += `   Расписание: ${scheduleStatus}\n\n`;

      keyboard.push([
        {
          text: `⚙️ ${channel.title.substring(0, 20)}${channel.title.length > 20 ? '...' : ''}`,
          callback_data: `channel_detail_${channel._id}`
        }
      ]);
    });

    // Добавляем кнопку добавления нового канала
    keyboard.push([
      { text: '➕ Добавить канал', callback_data: 'add_channel' }
    ]);

    // Добавляем кнопку возврата
    keyboard.push([
      { text: '🔙 Назад', callback_data: 'main_menu' }
    ]);

    await ctx.reply(message, {
      reply_markup: { inline_keyboard: keyboard }
    });
  });

  // Меню расписания
  bot.action('schedule_menu', async (ctx) => {
    const channels = await Channel.find({ owner: ctx.user._id });

    if (channels.length === 0) {
      await ctx.answerCbQuery('❌ У вас нет подключенных каналов');
      return;
    }

    // Создаем клавиатуру с безопасными проверками
    const keyboard = channels.map(channel => {
      // Безопасная проверка расписания (теперь внутри settings)
      const schedule = channel.settings?.schedule || {};
      const isEnabled = schedule.enabled || false;

      return [
        {
          text: `${channel.title} ${isEnabled ? '✅' : '❌'}`,
          callback_data: `schedule_channel_${channel._id}`
        }
      ];
    });

    keyboard.push([{ text: '🔙 Назад', callback_data: 'main_menu' }]);

    await ctx.editMessageText('⏰ Управление расписанием постов\n\nВыберите канал для настройки:', {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  });

  // Настройка расписания для канала
  bot.action(/schedule_channel_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    // Инициализируем schedule если его нет (теперь внутри settings)
    if (!channel.settings) {
      channel.settings = {
        mode: 'combined',
        autoPublish: true,
        schedule: {
          enabled: false,
          times: []
        }
      };
    } else if (!channel.settings.schedule) {
      channel.settings.schedule = {
        enabled: false,
        times: []
      };
    }

    await channel.save();

    const schedule = channel.settings.schedule;
    const scheduleText = schedule.times.length > 0 ?
      schedule.times.map(time => `🕒 ${time}`).join('\n') :
      '❌ Расписание не настроено';

    const message = `⏰ Расписание для: ${channel.title}\n\n` +
      `Статус: ${schedule.enabled ? '✅ Включено' : '❌ Выключено'}\n` +
      `Время публикаций:\n${scheduleText}\n\n` +
      `Выберите действие:`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ Добавить время', callback_data: `schedule_add_time_${channel._id}` },
            { text: '🗑️ Очистить расписание', callback_data: `schedule_clear_${channel._id}` }
          ],
          [
            {
              text: schedule.enabled ? '❌ Выключить' : '✅ Включить',
              callback_data: `schedule_toggle_${channel._id}`
            }
          ],
          [
            { text: '🔙 Назад', callback_data: 'schedule_menu' }
          ]
        ]
      }
    });
  });

  // Добавление времени в расписание
  bot.action(/schedule_add_time_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    ctx.session = ctx.session || {};
    ctx.session.scheduleChannelId = channelId;
    ctx.session.waitingForScheduleTime = true;

    await ctx.editMessageText(`⏰ Добавление времени для публикации\n\n` +
      `Введите время в формате ЧЧ:MM (например, 09:00, 14:30, 18:45)\n` +
      `Можно добавить несколько времен через запятую: 09:00, 14:30, 19:00\n\n` +
      `❌ Для отмены введите "отмена"`);
  });


  // Очистка расписания
  bot.action(/schedule_clear_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    // Инициализируем settings и schedule если их нет
    if (!channel.settings) {
      channel.settings = {
        mode: 'combined',
        autoPublish: true,
        schedule: {
          enabled: false,
          times: []
        }
      };
    } else if (!channel.settings.schedule) {
      channel.settings.schedule = {
        enabled: false,
        times: []
      };
    }

    channel.settings.schedule.times = [];
    await channel.save();

    await ctx.answerCbQuery('✅ Расписание очищено');
    await ctx.editMessageText(`✅ Расписание для канала "${channel.title}" очищено`);
  });

  // Переключение расписания
  bot.action(/schedule_toggle_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    // Инициализируем settings и schedule если их нет
    if (!channel.settings) {
      channel.settings = {
        mode: 'combined',
        autoPublish: true,
        schedule: {
          enabled: false,
          times: []
        }
      };
    } else if (!channel.settings.schedule) {
      channel.settings.schedule = {
        enabled: false,
        times: []
      };
    }

    const schedule = channel.settings.schedule;

    // Безопасная проверка times
    const timesCount = (schedule.times || []).length;
    if (timesCount === 0) {
      await ctx.answerCbQuery('❌ Сначала добавьте время публикации');
      return;
    }

    schedule.enabled = !schedule.enabled;
    await channel.save();

    const status = schedule.enabled ? 'включено' : 'выключено';
    await ctx.answerCbQuery(`✅ Расписание ${status}`);
    await ctx.editMessageText(`✅ Расписание для канала "${channel.title}" ${status}!`);
  });

  // AI Генерация с выбором типа поста
  bot.hears('🤖 AI Генерация', async (ctx) => {
    const currentUser = await User.findById(ctx.user._id);
    const userPlan = SUBSCRIPTION_PLANS[currentUser.subscription.plan];

    console.log('🔍 AI Access Check:', {
      plan: currentUser.subscription.plan,
      isTrial: currentUser.subscription.isTrial,
      aiAccess: userPlan?.aiAccess,
      trialEndDate: currentUser.subscription.trialEndDate,
      now: new Date()
    });

    const hasAIAccess = currentUser.subscription.isTrial || userPlan?.aiAccess;

    if (!hasAIAccess) {
      return ctx.reply('❌ AI-генерация доступна только на платных тарифах. Обновите подписку!');
    }

    await ctx.reply('🎯 Выберите тип поста:', {
      reply_markup: postTypesKeyboard
    });
  });

  // Обработка выбора типа поста
  bot.action(/post_type_(.+)/, async (ctx) => {
    const postType = ctx.match[1];
    ctx.session = ctx.session || {};
    ctx.session.postType = postType;

    const postTypeInfo = POST_TYPES[postType];

    await ctx.editMessageText(
      `📝 Тип поста: ${postTypeInfo.name}\n\n` +
      `📋 ${postTypeInfo.description}\n\n` +
      `🎯 Примеры тем:\n${postTypeInfo.examples.join('\n')}\n\n` +
      `Теперь выберите стиль написания:`
    );
  });

  // // Обработка выбора стиля AI
  // bot.action(/ai_tone_(.+)/, async (ctx) => {
  //   const tone = ctx.match[1];
  //   ctx.session = ctx.session || {};
  //   ctx.session.aiTone = tone;

  //   const postType = ctx.session.postType || 'news';
  //   const postTypeInfo = POST_TYPES[postType];

  //   await ctx.editMessageText(
  //     `📝 Тип: ${postTypeInfo.name}\n` +
  //     `🎨 Стиль: ${tone}\n\n` +
  //     `Теперь отправьте тему для поста.\n\n` +
  //     `💡 Рекомендации:\n` +
  //     `• Будьте конкретны в описании темы\n` +
  //     `• Укажите ключевые моменты\n` +
  //     `• Добавьте контекст, если необходимо\n\n` +
  //     `Например: "${postTypeInfo.examples[0]}"`
  //   );
  //   ctx.session.waitingForAITopic = true;
  // });

  // RSS Ленты
  bot.hears('📰 RSS Ленты', async (ctx) => {
    const channels = await Channel.find({ owner: ctx.user._id });

    if (channels.length === 0) {
      return ctx.reply('❌ У вас нет подключенных каналов. Сначала добавьте канал.');
    }

    await ctx.reply('Выберите канал для настройки RSS:', {
      reply_markup: {
        inline_keyboard: [
          ...channels.map(channel =>
            [{ text: channel.title, callback_data: `rss_setup_${channel._id}` }]
          ),
          [{ text: '🔙 Назад', callback_data: 'main_menu' }]
        ]
      }
    });
  });

  // Обработка настройки RSS
  bot.action(/rss_setup_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    await ctx.scene.enter('rss-setup-scene', { channelId });
    await ctx.answerCbQuery();
  });

  // AI Генерация с выбором канала
  bot.action(/ai_generate_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      const currentUser = await User.findById(ctx.user._id);
      const userPlan = SUBSCRIPTION_PLANS[currentUser.subscription.plan];

      console.log('🔍 AI Generate Check:', {
        userId: currentUser.telegramId,
        plan: currentUser.subscription.plan,
        isTrial: currentUser.subscription.isTrial,
        aiAccess: userPlan?.aiAccess
      });

      const hasAIAccess = currentUser.subscription.isTrial || userPlan?.aiAccess;
      if (!hasAIAccess) {
        await ctx.answerCbQuery('❌ AI-генерация доступна только на платных тарифах');
        return;
      }

      const canPost = await UserService.canUserPost(currentUser);
      if (!canPost) {
        await ctx.answerCbQuery('❌ Вы достигли дневного лимита постов');
        return;
      }

      await ctx.answerCbQuery();
      await ctx.scene.enter('ai-post-scene', {
        channelId: channelId,
        user: currentUser
      });
    } catch (error) {
      console.error('Error entering AI scene:', error);
      await ctx.answerCbQuery('❌ Ошибка при запуске генерации');
    }
  });

  // Управление каналами
  bot.action('manage_channels', async (ctx) => {
    const channels = await Channel.find({ owner: ctx.user._id });

    let message = '⚙️ Управление каналами:\n\n';
    const keyboard = [];

    channels.forEach(channel => {
      // Безопасная проверка расписания (теперь внутри settings)
      const schedule = channel.settings?.schedule || {};
      const scheduleStatus = schedule.enabled ?
        `⏰ ${(schedule.times || []).length} раз в день` : '❌ Выкл';

      const mode = channel.settings?.mode || 'combined';
      const rssCount = channel.rssSources?.length || 0;

      message += `🔸 ${channel.title}\n`;
      message += `Режим: ${mode}\n`;
      message += `RSS: ${rssCount} источников\n`;
      message += `Расписание: ${scheduleStatus}\n\n`;

      keyboard.push([
        {
          text: `⚙️ ${channel.title.substring(0, 20)}`,
          callback_data: `channel_detail_${channel._id}`
        }
      ]);
    });

    keyboard.push([{ text: '🔙 Назад', callback_data: 'main_menu' }]);

    await ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard }
    });
  });

  // Детальная информация о канале
  bot.action(/channel_detail_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    if (channel.owner.toString() !== ctx.user._id.toString()) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    // Безопасная проверка расписания (теперь внутри settings)
    const schedule = channel.settings?.schedule || {};
    const scheduleStatus = schedule.enabled ?
      `⏰ ${(schedule.times || []).length} раз в день` : '❌ Выключено';

    const message = `📊 Канал: ${channel.title}\n\n` +
      `🔧 Режим: ${channel.settings?.mode || 'combined'}\n` +
      `📰 RSS источников: ${channel.rssSources?.length || 0}\n` +
      `🤖 AI стиль: ${channel.aiSettings?.tone || 'professional'}\n` +
      `🚀 Автопостинг: ${channel.settings?.autoPublish ? '✅' : '❌'}\n` +
      `⏰ Расписание: ${scheduleStatus}\n\n` +
      `Выберите действие:`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📰 RSS', callback_data: `manage_rss_${channel._id}` },
            { text: '🤖 AI', callback_data: `ai_settings_${channel._id}` }
          ],
          [
            { text: '🚀 Создать пост', callback_data: `ai_generate_${channel._id}` },
            { text: '⏰ Расписание', callback_data: `schedule_settings_${channel._id}` }
          ],
          [
            { text: '⚙️ Настройки', callback_data: `channel_settings_${channel._id}` }
          ],
          [
            { text: '🔙 Назад', callback_data: 'manage_channels' }
          ]
        ]
      }
    });
  });

  // Настройки расписания для канала
  bot.action(/schedule_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    // Инициализируем settings и schedule если их нет
    if (!channel.settings) {
      channel.settings = {
        mode: 'combined',
        autoPublish: true,
        schedule: {
          enabled: false,
          times: []
        }
      };
    } else if (!channel.settings.schedule) {
      channel.settings.schedule = {
        enabled: false,
        times: []
      };
    }

    await channel.save();

    const schedule = channel.settings.schedule;
    const scheduleText = schedule.times.length > 0 ?
      schedule.times.map(time => `🕒 ${time}`).join('\n') :
      '❌ Расписание не настроено';

    const message = `⏰ Расписание для: ${channel.title}\n\n` +
      `Статус: ${schedule.enabled ? '✅ Включено' : '❌ Выключено'}\n` +
      `Время публикаций:\n${scheduleText}\n\n` +
      `Выберите действие:`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ Добавить время', callback_data: `schedule_add_time_${channel._id}` },
            { text: '🗑️ Очистить расписание', callback_data: `schedule_clear_${channel._id}` }
          ],
          [
            {
              text: schedule.enabled ? '❌ Выключить' : '✅ Включить',
              callback_data: `schedule_toggle_${channel._id}`
            }
          ],
          [
            { text: '🔙 Назад', callback_data: `channel_detail_${channel._id}` }
          ]
        ]
      }
    });
  });

  // Управление RSS для канала
  bot.action(/manage_rss_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    let message = `📰 RSS источники для: ${channel.title}\n\n`;

    if (channel.rssSources.length === 0) {
      message += '❌ Нет добавленных RSS источников\n\n';
    } else {
      channel.rssSources.forEach((source, index) => {
        message += `${index + 1}. ${source.url}\n`;
        message += `   Включить: ${source.includeKeywords.join(', ') || 'все'}\n`;
        message += `   Исключить: ${source.excludeKeywords.join(', ') || 'нет'}\n\n`;
      });
    }

    message += 'Выберите действие:';

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить RSS', callback_data: `rss_setup_${channel._id}` }],
          channel.rssSources.length > 0 ?
            [{ text: '🗑️ Удалить RSS', callback_data: `delete_rss_${channel._id}` }] :
            [],
          [{ text: '🔙 Назад', callback_data: `channel_detail_${channel._id}` }]
        ]
      }
    });
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

  // Обработчик кнопки "Моя подписка"
  bot.action('my_subscription', async (ctx) => {
    try {
      const user = ctx.user;
      const currentPlan = SUBSCRIPTION_PLANS[user.subscription.plan];

      // Рассчитываем оставшиеся дни подписки
      const now = new Date();
      const endDate = new Date(user.subscription.endDate);
      const daysLeft = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));

      // Рассчитываем оставшиеся дни пробного периода
      const trialEndDate = new Date(user.subscription.trialEndDate);
      const trialDaysLeft = Math.max(0, Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24)));

      let message = `💎 *Ваша подписка*\n\n`;

      // Информация о текущем тарифе
      message += `📊 *Текущий тариф:* ${currentPlan?.name || user.subscription.plan}\n`;
      message += `⏰ *Статус:* ${user.subscription.isActive ? '✅ Активна' : '❌ Неактивна'}\n`;

      if (user.subscription.isTrial) {
        message += `🎁 *Пробный период:* ✅ Активен (осталось ${trialDaysLeft} дней)\n`;
        message += `📅 *Пробный период до:* ${trialEndDate.toLocaleDateString('ru-RU')}\n`;
      } else {
        message += `🎁 *Пробный период:* ❌ Завершен\n`;
      }

      if (!user.subscription.isTrial) {
        message += `📅 *Подписка до:* ${endDate.toLocaleDateString('ru-RU')}\n`;
        message += `⏳ *Осталось дней:* ${daysLeft}\n`;
      }

      message += `\n📈 *Ваши лимиты:*\n`;
      message += `• 📺 Каналов: ${user.limits.channels}/${currentPlan?.channels || 1}\n`;
      message += `• 📝 Постов сегодня: ${user.limits.postsToday}/${user.limits.postsPerDay}\n`;
      message += `• 🤖 AI-генерация: ${user.limits.aiAccess ? '✅ Доступна' : '❌ Недоступна'}\n`;
      message += `• ⏰ Планировщик: ${user.limits.scheduling ? '✅ Доступен' : '❌ Недоступен'}\n`;

      // Информация об использовании
      const userChannels = await Channel.countDocuments({ owner: user._id });
      message += `\n📊 *Использование:*\n`;
      message += `• 📺 Добавлено каналов: ${userChannels}/${user.limits.channels}\n`;
      message += `• 📝 Постов сегодня: ${user.limits.postsToday}/${user.limits.postsPerDay}\n`;

      // Рекомендации
      if (userChannels >= user.limits.channels) {
        message += `\n⚠️ *Вы достигли лимита каналов!*\n`;
      }

      if (user.limits.postsToday >= user.limits.postsPerDay) {
        message += `\n⚠️ *Вы достигли дневного лимита постов!*\n`;
      }

      if (user.subscription.isTrial && trialDaysLeft <= 3) {
        message += `\n🎁 *Пробный период скоро закончится!* Выберите тариф для продолжения работы.\n`;
      }

      if (!user.subscription.isTrial && daysLeft <= 7) {
        message += `\n⏰ *Подписка скоро закончится!* Продлите её для непрерывной работы.\n`;
      }

      const keyboard = [
        [
        ]
      ];

      // Добавляем кнопку продления, если подписка активна и не пробная
      if (!user.subscription.isTrial && user.subscription.isActive) {
        keyboard.unshift([
          { text: '🔄 Продлить подписку', callback_data: `user_select_plan_${user.subscription.plan}` }
        ]);
      }

      // Добавляем кнопку возврата
      keyboard.push([
        { text: '🔙 Назад', callback_data: 'main_menu' }
      ]);

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error) {
      console.error('Error in my_subscription handler:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке информации о подписке');
      await ctx.reply('❌ Произошла ошибка при загрузке информации о подписке. Попробуйте позже.');
    }
  });

  bot.hears('🔙 В главное меню', async (ctx) => {
    const { userMainKeyboard } = require('../keyboards/keyboards');
    await ctx.reply('Главное меню:', {
      reply_markup: userMainKeyboard
    });
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
  // // Настройки AI для канала
  // bot.action(/ai_settings_(.+)/, async (ctx) => {
  //   const channelId = ctx.match[1];
  //   const channel = await Channel.findById(channelId);

  //   const message = `🤖 Настройки AI для: ${channel.title}\n\n` +
  //     `Текущий стиль: ${channel.aiSettings.tone}\n` +
  //     `Темы: ${channel.aiSettings.topics.join(', ') || 'не заданы'}\n\n` +
  //     `Выберите стиль генерации:`;

  //   await ctx.editMessageText(message, {
  //     reply_markup: {
  //       inline_keyboard: [
  //         [
  //           { text: '💼 Проф', callback_data: `set_ai_tone_${channel._id}_professional` },
  //           { text: '😄 Юмор', callback_data: `set_ai_tone_${channel._id}_humorous` }
  //         ],
  //         [
  //           { text: '📰 Новости', callback_data: `set_ai_tone_${channel._id}_news` },
  //           { text: '🎯 Реклама', callback_data: `set_ai_tone_${channel._id}_advertising` }
  //         ],
  //         [
  //           { text: '🎓 Образование', callback_data: `set_ai_tone_${channel._id}_educational` }
  //         ],
  //         [
  //           { text: '🔙 Назад', callback_data: `channel_detail_${channel._id}` }
  //         ]
  //       ]
  //     }
  //   });
  // });

  // // Смена стиля AI
  // bot.action(/set_ai_tone_(.+)_(.+)/, async (ctx) => {
  //   const channelId = ctx.match[1];
  //   const tone = ctx.match[2];

  //   const channel = await Channel.findById(channelId);
  //   if (!channel) {
  //     await ctx.answerCbQuery('❌ Канал не найден');
  //     return;
  //   }

  //   channel.aiSettings.tone = tone;
  //   await channel.save();

  //   await ctx.answerCbQuery(`✅ Стиль изменен на: ${tone}`);
  //   await ctx.editMessageText(`✅ Стиль AI для канала "${channel.title}" изменен на: ${tone}`);
  // });

  // // Настройки канала
  // bot.action(/channel_settings_(.+)/, async (ctx) => {
  //   const channelId = ctx.match[1];
  //   const channel = await Channel.findById(channelId);

  //   const message = `⚙️ Настройки канала: ${channel.title}\n\n` +
  //     `Текущий режим: ${channel.settings.mode}\n` +
  //     `Выберите новый режим работы:`;

  //   await ctx.editMessageText(message, {
  //     reply_markup: {
  //       inline_keyboard: [
  //         [
  //           { text: '📰 Только RSS', callback_data: `set_mode_${channel._id}_rss` },
  //           { text: '🤖 Только AI', callback_data: `set_mode_${channel._id}_ai` }
  //         ],
  //         [
  //           { text: '🔀 Комбинированный', callback_data: `set_mode_${channel._id}_combined` }
  //         ],
  //         [
  //           { text: '🔄 Автопостинг', callback_data: `toggle_autopost_${channel._id}` }
  //         ],
  //         [
  //           { text: '🔙 Назад', callback_data: `channel_detail_${channel._id}` }
  //         ]
  //       ]
  //     }
  //   });
  // });

  // Смена режима канала
  bot.action(/set_mode_(.+)_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const mode = ctx.match[2];

    const channel = await Channel.findById(channelId);
    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    channel.settings.mode = mode;
    await channel.save();

    await ctx.answerCbQuery(`✅ Режим изменен на: ${mode}`);
    await ctx.editMessageText(`✅ Режим канала "${channel.title}" изменен на: ${mode}\n\nКанал готов к работе!`);
  });

  // Переключение автопостинга
  bot.action(/toggle_autopost_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    const channel = await Channel.findById(channelId);
    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    channel.settings.autoPublish = !channel.settings.autoPublish;
    await channel.save();

    const status = channel.settings.autoPublish ? 'включен' : 'выключен';
    await ctx.answerCbQuery(`✅ Автопостинг ${status}`);
    await ctx.editMessageText(`✅ Автопостинг для канала "${channel.title}" ${status}!`);



    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const stats = await AutoPostService.getAutoPostStats();

      const message = `🚀 Настройки автопостинга: ${channel.title}\n\n` +
        `📊 Статус: ${channel.settings.autoPublish ? '✅ Включен' : '❌ Выключен'}\n` +
        `🔧 Режим: ${channel.settings.mode}\n` +
        `⏰ Расписание: ${channel.settings.schedule.enabled ? '✅ Включено' : '❌ Выключено'}\n` +
        `🕐 Время публикаций: ${channel.settings.schedule.times.join(', ') || 'не задано'}\n` +
        `📅 Интервал: ${channel.settings.schedule.interval} минут\n\n` +
        `📈 Статистика системы:\n` +
        `• Всего каналов с автопостингом: ${stats.totalChannels}\n` +
        `• Активных с расписанием: ${stats.activeChannels}\n` +
        `• RSS каналов: ${stats.rssChannels}\n` +
        `• AI каналов: ${stats.aiChannels}\n\n` +
        `Управление настройками:`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: channel.settings.autoPublish ? '❌ Выключить' : '✅ Включить',
                callback_data: `toggle_autopost_${channel._id}`
              },
              {
                text: '⏰ Расписание',
                callback_data: `schedule_settings_${channel._id}`
              }
            ],
            [
              {
                text: '🔧 Режим работы',
                callback_data: `mode_settings_${channel._id}`
              },
              {
                text: '⚙️ Настройки постов',
                callback_data: `post_settings_${channel._id}`
              }
            ],
            [
              {
                text: '🚀 Запустить сейчас',
                callback_data: `force_process_${channel._id}`
              },
              {
                text: '📊 Статистика',
                callback_data: `channel_stats_${channel._id}`
              }
            ],
            [
              {
                text: '🔙 Назад',
                callback_data: `channel_settings_${channel._id}`
              }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Autopost settings error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке настроек');
    }
  });

  // Удаление RSS
  bot.action(/delete_rss_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    await ctx.scene.enter('rss-delete-scene', { channelId });
    await ctx.answerCbQuery();
  });

  // Главное меню
  bot.action('main_menu', async (ctx) => {
    try {
      await ctx.editMessageText('Главное меню:', {
        reply_markup: { inline_keyboard: [] }
      });
      await ctx.reply('Выберите действие:', {
        reply_markup: userMainKeyboard
      });
    } catch (error) {
      await ctx.reply('Главное меню:', {
        reply_markup: userMainKeyboard
      });
    }
  });

  // Добавление канала
  bot.action('add_channel', async (ctx) => {
    await ctx.editMessageText(`Чтобы добавить канал:

1. Добавьте @${ctx.botInfo.username} как администратора в ваш канал
2. Дайте права на отправку сообщений
3. Перешлите любое сообщение из канала в этот чат

После этого канал автоматически подключится к системе.`);
  });


  // Статистика каналов
  bot.action('channel_stats', async (ctx) => {
    const channels = await Channel.find({ owner: ctx.user._id });

    let message = `📊 Статистика:\n\n` +
      `Каналов: ${channels.length}/${ctx.user.limits.channels}\n` +
      `Постов сегодня: ${ctx.user.limits.postsToday}/${ctx.user.limits.postsPerDay}\n` +
      `Режим: ${ctx.user.subscription.isTrial ? 'Пробный' : ctx.user.subscription.plan}\n\n`;

    if (channels.length > 0) {
      message += `Ваши каналы:\n`;
      channels.forEach(channel => {
        // Безопасная проверка расписания
        const schedule = channel.settings?.schedule || {};
        const scheduleStatus = schedule.enabled ?
          ` (⏰ ${(schedule.times || []).length})` : '';
        message += `• ${channel.title} (${channel.settings?.mode || 'combined'})${scheduleStatus}\n`;
      });
    }

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад', callback_data: 'main_menu' }]
        ]
      }
    });
  });


  // Обработка пересылаемых сообщений из каналов
  bot.on('message', async (ctx) => {
    if (ctx.message.forward_from_chat && ctx.message.forward_from_chat.type === 'channel') {
      const chat = ctx.message.forward_from_chat;

      try {
        // Проверяем, является ли бот администратором
        const chatMember = await ctx.telegram.getChatMember(chat.id, ctx.botInfo.id);

        if (chatMember.status === 'administrator' && chatMember.can_post_messages) {
          // Проверяем лимиты каналов
          const userChannels = await Channel.countDocuments({ owner: ctx.user._id });
          const maxChannels = ctx.user.limits.channels;

          if (userChannels >= maxChannels) {
            return ctx.reply(`❌ Вы достигли лимита каналов (${maxChannels}). 
Улучшите тарифный план чтобы добавить больше каналов.`);
          }

          // Проверяем, не подключен ли уже канал
          const existingChannel = await Channel.findOne({
            channelId: chat.id.toString(),
            owner: ctx.user._id
          });

          let channel;

          if (existingChannel) {
            // Обновляем существующий канал
            existingChannel.title = chat.title;
            existingChannel.username = chat.username;
            existingChannel.isActive = true;
            existingChannel.settings.autoPublish = true;
            await existingChannel.save();
            channel = existingChannel;
          } else {
            // Создаем новый канал
            channel = new Channel({
              title: chat.title,
              channelId: chat.id.toString(),
              username: chat.username,
              owner: ctx.user._id,
              settings: {
                mode: 'rss',
                autoPublish: true,
                schedule: {
                  enabled: false,
                  times: [],
                  interval: 60
                },
                postSettings: {
                  includeImages: true,
                  maxLength: 4000,
                  addHashtags: true,
                  watermark: '',
                  parseMode: 'HTML'
                }
              },
              rssSources: [],
              aiSettings: {
                tone: 'professional',
                topics: []
              },
              statistics: {
                totalPosts: 0,
                postsToday: 0
              },
              isActive: true
            });
            await channel.save();
          }

          await ctx.reply(`✅ Канал "${chat.title}" успешно подключен! 

Настройте режим работы канала:`, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📰 Только RSS', callback_data: `set_mode_${channel._id}_rss` },
                  { text: '🤖 Только AI', callback_data: `set_mode_${channel._id}_ai` }
                ],
                [
                  { text: '🔀 Комбинированный', callback_data: `set_mode_${channel._id}_combined` }
                ],
                [
                  { text: '⚙️ Дополнительные настройки', callback_data: `channel_settings_${channel._id}` }
                ]
              ]
            }
          });
        } else {
          await ctx.reply('❌ Бот не имеет прав на публикацию в этом канале. Пожалуйста, предоставьте права администратора с разрешением на отправку сообщений.');
        }
      } catch (error) {
        console.error('Channel connection error:', error);
        await ctx.reply('❌ Не удалось подключить канал. Убедитесь, что бот добавлен как администратор.');
      }
    }
  });

  // Обработка смены режима канала
  bot.action(/set_mode_(.+)_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const mode = ctx.match[2];

    try {
      await Channel.findByIdAndUpdate(channelId, {
        'settings.mode': mode
      });

      await ctx.answerCbQuery(`✅ Режим изменен на: ${mode}`);
      await ctx.editMessageText(`✅ Режим канала изменен на: ${mode}\n\nКанал готов к работе!`);
    } catch (error) {
      console.error('Set mode error:', error);
      await ctx.answerCbQuery('❌ Ошибка при изменении режима');
    }
  });

  // Настройки автопостинга
  bot.action(/autopost_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const stats = await AutoPostService.getAutoPostStats();

      const message = `🚀 Настройки автопостинга: ${channel.title}\n\n` +
        `📊 Статус: ${channel.settings.autoPublish ? '✅ Включен' : '❌ Выключен'}\n` +
        `🔧 Режим: ${channel.settings.mode}\n` +
        `⏰ Расписание: ${channel.settings.schedule.enabled ? '✅ Включено' : '❌ Выключено'}\n` +
        `🕐 Время публикаций: ${channel.settings.schedule.times.join(', ') || 'не задано'}\n` +
        `📅 Интервал: ${channel.settings.schedule.interval} минут\n\n` +
        `📈 Статистика системы:\n` +
        `• Всего каналов с автопостингом: ${stats.totalChannels}\n` +
        `• Активных с расписанием: ${stats.activeChannels}\n` +
        `• RSS каналов: ${stats.rssChannels}\n` +
        `• AI каналов: ${stats.aiChannels}\n\n` +
        `Управление настройками:`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: channel.settings.autoPublish ? '❌ Выключить' : '✅ Включить',
                callback_data: `toggle_autopost_${channel._id}`
              },
              {
                text: '⏰ Расписание',
                callback_data: `schedule_settings_${channel._id}`
              }
            ],
            [
              {
                text: '🔧 Режим работы',
                callback_data: `mode_settings_${channel._id}`
              },
              {
                text: '⚙️ Настройки постов',
                callback_data: `post_settings_${channel._id}`
              }
            ],
            [
              {
                text: '🚀 Запустить сейчас',
                callback_data: `force_process_${channel._id}`
              },
              {
                text: '📊 Статистика',
                callback_data: `channel_stats_${channel._id}`
              }
            ],
            [
              {
                text: '🔙 Назад',
                callback_data: `channel_settings_${channel._id}`
              }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Autopost settings error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке настроек');
    }
  });

  // // Переключение автопостинга
  // bot.action(/toggle_autopost_(.+)/, async (ctx) => {
  //   const channelId = ctx.match[1];

  //   try {
  //     const channel = await Channel.findById(channelId);
  //     if (!channel) {
  //       await ctx.answerCbQuery('❌ Канал не найден');
  //       return;
  //     }

  //     channel.settings.autoPublish = !channel.settings.autoPublish;
  //     await channel.save();

  //     const status = channel.settings.autoPublish ? 'включен' : 'выключен';
  //     await ctx.answerCbQuery(`✅ Автопостинг ${status}`);

  //     // Обновляем сообщение
  //     await ctx.editMessageText(`✅ Автопостинг для канала "${channel.title}" ${status}!`, {
  //       reply_markup: {
  //         inline_keyboard: [
  //           [{
  //             text: '🔙 К настройкам',
  //             callback_data: `autopost_settings_${channel._id}`
  //           }]
  //         ]
  //       }
  //     });
  //   } catch (error) {
  //     console.error('Toggle autopost error:', error);
  //     await ctx.answerCbQuery('❌ Ошибка при переключении автопостинга');
  //   }
  // });

  // Настройки расписания
  bot.action(/schedule_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const message = `⏰ Настройки расписания: ${channel.title}\n\n` +
        `Текущий статус: ${channel.settings.schedule.enabled ? '✅ Включено' : '❌ Выключено'}\n` +
        `Время публикаций: ${channel.settings.schedule.times.join(', ') || 'не задано'}\n` +
        `Интервал: ${channel.settings.schedule.interval} минут\n\n` +
        `Примеры времени: 09:00, 14:30, 19:45\n` +
        `Можно указать несколько времен через запятую\n\n` +
        `Доступные команды:`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🔄 Вкл/Выкл',
                callback_data: `toggle_schedule_${channel._id}`
              },
              {
                text: '✏️ Время',
                callback_data: `edit_schedule_times_${channel._id}`
              }
            ],
            [
              {
                text: '📅 Интервал',
                callback_data: `edit_schedule_interval_${channel._id}`
              },
              {
                text: '🔄 Сбросить',
                callback_data: `reset_schedule_${channel._id}`
              }
            ],
            [
              {
                text: '🔙 Назад',
                callback_data: `autopost_settings_${channel._id}`
              }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Schedule settings error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке расписания');
    }
  });

  // Переключение расписания
  bot.action(/toggle_schedule_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      channel.settings.schedule.enabled = !channel.settings.schedule.enabled;
      await channel.save();

      const status = channel.settings.schedule.enabled ? 'включено' : 'выключено';
      await ctx.answerCbQuery(`✅ Расписание ${status}`);

      // Возвращаемся к настройкам расписания
      await ctx.editMessageText(`✅ Расписание автопостинга для "${channel.title}" ${status}!`, {
        reply_markup: {
          inline_keyboard: [
            [{
              text: '🔙 К расписанию',
              callback_data: `schedule_settings_${channel._id}`
            }]
          ]
        }
      });
    } catch (error) {
      console.error('Toggle schedule error:', error);
      await ctx.answerCbQuery('❌ Ошибка при переключении расписания');
    }
  });

  // Редактирование времени расписания
  bot.action(/edit_schedule_times_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      await ctx.editMessageText(`⏰ Укажите время публикаций для канала "${channel.title}":\n\n` +
        `Формат: ЧЧ:MM\n` +
        `Пример: 09:00, 14:30, 19:45\n` +
        `Можно указать несколько времен через запятую\n\n` +
        `Текущее время: ${channel.settings.schedule.times.join(', ') || 'не задано'}\n\n` +
        `Отправьте новое время:`);

      ctx.session = ctx.session || {};
      ctx.session.waitingForScheduleTimes = true;
      ctx.session.editingChannelId = channelId;
    } catch (error) {
      console.error('Edit schedule times error:', error);
      await ctx.answerCbQuery('❌ Ошибка при настройке времени');
    }
  });

  // Редактирование интервала
  bot.action(/edit_schedule_interval_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      await ctx.editMessageText(`📅 Укажите интервал публикаций (в минутах) для канала "${channel.title}":\n\n` +
        `Текущий интервал: ${channel.settings.schedule.interval} минут\n\n` +
        `Рекомендуемые интервалы:\n` +
        `• 30 минут - частое обновление\n` +
        `• 60 минут - стандартный режим\n` +
        `• 120 минут - редкие публикации\n\n` +
        `Отправьте новый интервал (число):`);

      ctx.session = ctx.session || {};
      ctx.session.waitingForScheduleInterval = true;
      ctx.session.editingChannelId = channelId;
    } catch (error) {
      console.error('Edit schedule interval error:', error);
      await ctx.answerCbQuery('❌ Ошибка при настройке интервала');
    }
  });

  // Настройки режима работы
  bot.action(/mode_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const message = `🔧 Режим работы: ${channel.title}\n\n` +
        `Текущий режим: ${channel.settings.mode}\n\n` +
        `📰 *Только RSS* - посты из RSS лент\n` +
        `🤖 *Только AI* - AI генерация постов\n` +
        `🔀 *Комбинированный* - сначала RSS, если нет новых - AI\n\n` +
        `Выберите новый режим:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📰 Только RSS',
                callback_data: `set_mode_${channel._id}_rss`
              },
              {
                text: '🤖 Только AI',
                callback_data: `set_mode_${channel._id}_ai`
              }
            ],
            [
              {
                text: '🔀 Комбинированный',
                callback_data: `set_mode_${channel._id}_combined`
              }
            ],
            [
              {
                text: '🔙 Назад',
                callback_data: `autopost_settings_${channel._id}`
              }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Mode settings error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке режимов');
    }
  });

  // Настройки постов
  bot.action(/post_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const message = `⚙️ Настройки постов: ${channel.title}\n\n` +
        `📷 Изображения: ${channel.settings.postSettings.includeImages ? '✅' : '❌'}\n` +
        `📏 Макс. длина: ${channel.settings.postSettings.maxLength} символов\n` +
        `🏷️ Хештеги: ${channel.settings.postSettings.addHashtags ? '✅' : '❌'}\n` +
        `💧 Водяной знак: ${channel.settings.postSettings.watermark || 'нет'}\n` +
        `📝 Формат: ${channel.settings.postSettings.parseMode}\n\n` +
        `Изменить настройки:`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📷 Изображения',
                callback_data: `toggle_images_${channel._id}`
              },
              {
                text: '🏷️ Хештеги',
                callback_data: `toggle_hashtags_${channel._id}`
              }
            ],
            [
              {
                text: '📏 Длина',
                callback_data: `set_length_${channel._id}`
              },
              {
                text: '💧 Водяной знак',
                callback_data: `set_watermark_${channel._id}`
              }
            ],
            [
              {
                text: '📝 Формат',
                callback_data: `set_parse_mode_${channel._id}`
              }
            ],
            [
              {
                text: '🔙 Назад',
                callback_data: `autopost_settings_${channel._id}`
              }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Post settings error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке настроек постов');
    }
  });

  // Принудительный запуск обработки
  bot.action(/force_process_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    await ctx.answerCbQuery('🔄 Запускаем обработку...');

    try {
      const result = await AutoPostService.forceProcessChannel(channelId);

      if (result.published > 0) {
        await ctx.editMessageText(`✅ Обработка завершена!\n\nОпубликовано постов: ${result.published}\n\nКанал продолжит работу по расписанию.`);
      } else {
        await ctx.editMessageText(`ℹ️ Обработка завершена.\n\nНовых постов для публикации не найдено.\nПроверьте настройки RSS или AI.`);
      }
    } catch (error) {
      console.error('Force process error:', error);
      await ctx.editMessageText('❌ Ошибка при обработке канала');
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

  // Создаем базовое сообщение
  let message = `📊 Информация о канале:\n\n` +
    `🔸 Название: ${channel.title}\n` +
    `👤 Владелец: ${channel.owner.firstName}${channel.owner.username ? ` (@${channel.owner.username})` : ''}\n` +
    `🆔 ID владельца: ${channel.owner.telegramId}\n` +
    `🔧 Режим: ${channel.settings.mode}\n` +
    `📰 RSS источников: ${channel.rssSources.length}\n` +
    `🚀 Автопостинг: ${channel.settings.autoPublish ? '✅' : '❌'}\n` +
    `📈 Постов всего: ${channel.statistics?.totalPosts || 0}\n` +
    `📅 Создан: ${channel.createdAt.toLocaleDateString('ru-RU')}\n\n` +
    `RSS источники:\n`;

  // Добавляем информацию о RSS источниках
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
            amount: totalPrice
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
        amount: payment.total_amount, // Конвертируем обратно в звезды
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







  // ==================== АДМИНСКИЕ ОБРАБОТЧИКИ ====================

  // Возврат в админ-панель
  bot.action('admin_back_to_panel', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await ctx.editMessageText('🛠 Панель администратора');
  });

  // Экспорт финансов
  bot.action('admin_export_finance', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const transactions = await Transaction.find({ status: 'completed' })
        .populate('userId', 'telegramId firstName username')
        .sort({ createdAt: -1 })
        .limit(1000);

      if (transactions.length === 0) {
        await ctx.answerCbQuery('❌ Нет данных для экспорта');
        return;
      }

      const csvPath = path.join(__dirname, '../../temp/transactions.csv');

      const csvWriter = createObjectCsvWriter({
        path: csvPath,
        header: [
          { id: 'date', title: 'Дата' },
          { id: 'user', title: 'Пользователь' },
          { id: 'userId', title: 'ID пользователя' },
          { id: 'plan', title: 'Тариф' },
          { id: 'amount', title: 'Сумма (звезды)' },
          { id: 'status', title: 'Статус' }
        ]
      });

      const records = transactions.map(t => ({
        date: t.createdAt.toLocaleString('ru-RU'),
        user: t.userId ? `${t.userId.firstName}${t.userId.username ? ` (@${t.userId.username})` : ''}` : 'Unknown',
        userId: t.userId ? t.userId.telegramId : 'Unknown',
        plan: t.plan,
        amount: t.amount,
        status: t.status
      }));

      await csvWriter.writeRecords(records);

      await ctx.replyWithDocument({
        source: csvPath,
        filename: `transactions_${new Date().toISOString().split('T')[0]}.csv`
      });

      setTimeout(() => {
        if (fs.existsSync(csvPath)) {
          fs.unlinkSync(csvPath);
        }
      }, 30000);

    } catch (error) {
      console.error('Export error:', error);
      await ctx.answerCbQuery('❌ Ошибка при экспорте');
    }
  });

  // Сброс статистики AI
  bot.action('admin_reset_ai_stats', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    AIService.resetDailyStats();
    await ctx.answerCbQuery('✅ Статистика AI сброшена');
    await ctx.editMessageText('✅ Статистика AI успешно сброшена!');
  });

  // Поиск пользователя
  bot.action('admin_find_user', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await ctx.editMessageText('Введите ID пользователя, username или @упоминание для поиска:');
    ctx.session.waitingForUserSearch = true;
  });

  // Все пользователи
  bot.action('admin_all_users', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const users = await User.find().sort({ createdAt: -1 }).limit(50);

      let message = '👥 Последние 50 пользователей:\n\n';

      users.forEach((user, index) => {
        message += `${index + 1}. ${user.firstName}${user.username ? ` (@${user.username})` : ''}\n`;
        message += `   ID: ${user.telegramId}\n`;
        message += `   Тариф: ${user.subscription.plan}\n`;
        message += `   Регистрация: ${user.createdAt.toLocaleDateString('ru-RU')}\n\n`;
      });

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'admin_back' }]
          ]
        }
      });
    } catch (error) {
      console.error('Admin all users error:', error);
      await ctx.answerCbQuery('❌ Ошибка при получении пользователей');
    }
  });

  // Назад в админ-панель
  bot.action('admin_back', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await ctx.editMessageText('🛠 Панель администратора');
  });

  // История транзакций
  bot.action('admin_transactions', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const transactions = await Transaction.find({ status: 'completed' })
        .populate('userId', 'telegramId firstName username')
        .sort({ createdAt: -1 })
        .limit(10);

      let message = '📈 Последние 10 транзакций:\n\n';

      if (transactions.length === 0) {
        message += '❌ Нет завершенных транзакций';
      } else {
        transactions.forEach((t, index) => {
          message += `${index + 1}. ${t.userId ? t.userId.firstName : 'Unknown'}\n`;
          message += `   Тариф: ${t.plan}\n`;
          message += `   Сумма: ${t.amount} звезд\n`;
          message += `   Дата: ${t.createdAt.toLocaleDateString('ru-RU')}\n\n`;
        });
      }

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Экспорт в CSV', callback_data: 'admin_export_finance' }],
            [{ text: '🔙 Назад', callback_data: 'admin_back_to_panel' }]
          ]
        }
      });
    } catch (error) {
      console.error('Admin transactions error:', error);
      await ctx.answerCbQuery('❌ Ошибка при получении транзакций');
    }
  });

  // Изменение тарифов
  bot.action('admin_edit_plan', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await ctx.scene.enter('edit-plan-scene');
    await ctx.answerCbQuery();
  });

  bot.action('admin_create_plan', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      await ctx.scene.enter('create-plan-scene');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Create plan scene error:', error);
      await ctx.answerCbQuery('❌ Ошибка при запуске создания тарифа');
    }
  });

  // Статистика тарифов
  bot.action('admin_plan_stats', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const stats = await User.aggregate([
        {
          $group: {
            _id: '$subscription.plan',
            total: { $sum: 1 },
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
            },
            trial: {
              $sum: {
                $cond: [{ $eq: ['$subscription.isTrial', true] }, 1, 0]
              }
            }
          }
        }
      ]);

      let message = '📊 Статистика по тарифам:\n\n';

      // Сортируем тарифы: сначала стандартные, потом кастомные
      const sortedStats = stats.sort((a, b) => {
        const aIsCustom = a._id.startsWith('CUSTOM_');
        const bIsCustom = b._id.startsWith('CUSTOM_');
        if (aIsCustom && !bIsCustom) return 1;
        if (!aIsCustom && bIsCustom) return -1;
        return a._id.localeCompare(b._id);
      });

      sortedStats.forEach(stat => {
        const plan = SUBSCRIPTION_PLANS[stat._id];
        if (plan) {
          const isCustom = stat._id.startsWith('CUSTOM_');
          message += `🔸 ${plan.name} ${isCustom ? '🎨' : ''}\n`;
          message += `   Всего: ${stat.total} пользователей\n`;
          message += `   Активных: ${stat.active}\n`;
          message += `   Пробных: ${stat.trial}\n\n`;
        }
      });

      // Общая статистика
      const totalUsers = await User.countDocuments();
      const activeSubs = await User.countDocuments({
        'subscription.plan': { $ne: 'FREE' },
        'subscription.endDate': { $gt: new Date() }
      });

      const customPlansCount = Object.keys(SUBSCRIPTION_PLANS).filter(key =>
        key.startsWith('CUSTOM_')
      ).length;

      message += `📈 Общая статистика:\n`;
      message += `   Всего пользователей: ${totalUsers}\n`;
      message += `   Активных подписок: ${activeSubs}\n`;
      message += `   Всего тарифов: ${Object.keys(SUBSCRIPTION_PLANS).length} (${customPlansCount} кастомных)\n`;
      message += `   Конверсия: ${totalUsers > 0 ? ((activeSubs / totalUsers) * 100).toFixed(1) : 0}%`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🆕 Создать тариф', callback_data: 'admin_create_plan' },
              { text: '🔄 Обновить', callback_data: 'admin_plan_stats' }
            ],
            [
              { text: '🔙 Назад к тарифам', callback_data: 'admin_back_to_plans' }
            ]
          ]
        }
      });

    } catch (error) {
      console.error('Plan stats error:', error);
      await ctx.editMessageText('❌ Ошибка при получении статистики');
    }
  });

  // Сброс тарифов
  bot.action('admin_reset_plans', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      await ctx.editMessageText('🔄 Сброс кастомных тарифов...\n\nЭта операция удалит все созданные тарифы и вернет стандартные настройки.', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Подтвердить сброс', callback_data: 'confirm_reset_plans' },
              { text: '❌ Отмена', callback_data: 'admin_back_to_plans' }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Reset plans error:', error);
      await ctx.answerCbQuery('❌ Ошибка при сбросе тарифов');
    }
  });

  // Подтверждение сброса тарифов
  bot.action('confirm_reset_plans', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const fs = require('fs');
      const path = require('path');

      const customPlansPath = path.join(__dirname, '../../config/custom_plans.json');

      if (fs.existsSync(customPlansPath)) {
        fs.unlinkSync(customPlansPath);
      }

      // Перезагружаем конфигурацию
      loadCustomPlans();

      await ctx.editMessageText('✅ Кастомные тарифы успешно сброшены!\n\nВсе созданные тарифы удалены, восстановлены стандартные настройки.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 К тарифам', callback_data: 'admin_back_to_plans' }]
          ]
        }
      });

    } catch (error) {
      console.error('Confirm reset plans error:', error);
      await ctx.editMessageText('❌ Ошибка при сбросе тарифов');
    }
  });

  // Возврат к списку тарифов
  bot.action('admin_back_to_plans', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    // Повторно показываем список тарифов
    let message = '💎 Текущие тарифные планы:\n\n';

    Object.entries(SUBSCRIPTION_PLANS).forEach(([key, plan]) => {
      message += `🔸 *${plan.name}*\n`;
      message += `   Каналов: ${plan.channels}\n`;
      message += `   Постов/день: ${plan.postsPerDay}\n`;
      message += `   AI: ${plan.aiAccess ? '✅' : '❌'}\n`;
      message += `   Цена: ${plan.price > 0 ? `${plan.price} звезд` : 'Бесплатно'}\n\n`;
    });

    await ctx.editMessageText(message, {
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
  });

  // Детальная статистика AI
  bot.action('admin_ai_detailed_stats', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    const aiStats = AIService.getUsageStats();

    const message = `📊 Детальная статистика AI:

• Всего запросов: ${aiStats.totalRequests}
• Запросов сегодня: ${aiStats.todayRequests}
• Общие затраты: ${aiStats.totalCost || 0} USD
• Средняя стоимость за запрос: ${aiStats.totalCost && aiStats.totalRequests ? (aiStats.totalCost / aiStats.totalRequests).toFixed(4) : 0} USD

📈 Использование по дням:
• Статистика по дням будет доступна в следующем обновлении`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔄 Сбросить статистику', callback_data: 'admin_reset_ai_stats' }],
          [{ text: '🔙 Назад', callback_data: 'admin_back_to_panel' }]
        ]
      }
    });
  });

  // Изменение API ключа AI
  bot.action('admin_change_ai_key', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const currentKey = ConfigService.getCurrentAIKey();
      const keyHistory = ConfigService.getKeyChangeHistory();

      let message = '🔧 Управление API ключом OpenAI\n\n';

      if (currentKey) {
        message += `📋 Текущий ключ: \`${currentKey}\`\n`;
        message += `✅ Ключ установлен и активен\n\n`;
      } else {
        message += `⚠️ API ключ не установлен\n\n`;
      }

      message += `📊 Статистика использования AI:\n`;
      const aiStats = require('../../services/AIService').getUsageStats();
      message += `• Всего запросов: ${aiStats.totalRequests}\n`;
      message += `• Запросов сегодня: ${aiStats.todayRequests}\n\n`;

      if (keyHistory.length > 0) {
        message += `🕐 История изменений (последние ${keyHistory.length}):\n`;
        keyHistory.slice(0, 3).forEach((change, index) => {
          const date = new Date(change.timestamp).toLocaleString('ru-RU');
          message += `${index + 1}. ${date} - ${change.newKey}\n`;
        });
        message += `\n`;
      }

      message += `Выберите действие:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Изменить API ключ', callback_data: 'change_ai_key_wizard' }],
            [{ text: '📊 Подробная статистика', callback_data: 'admin_ai_detailed_stats' }],
            [{ text: '🔄 Проверить ключ', callback_data: 'test_ai_key' }],
            [{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]
          ]
        }
      });

    } catch (error) {
      console.error('AI key management error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке информации о ключе');
    }
  });

  // Запуск сцены изменения ключа
  bot.action('change_ai_key_wizard', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      await ctx.scene.enter('change-ai-key-scene');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Change AI key scene error:', error);
      await ctx.answerCbQuery('❌ Ошибка при запуске мастера изменения ключа');
    }
  });

  // Тестирование API ключа
  bot.action('test_ai_key', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      await ctx.editMessageText('🔄 Проверка API ключа...');

      const AIService = require('../../services/AIService');

      // Пытаемся сделать тестовый запрос
      const testResult = await AIService.generatePost('тест', 'professional');

      if (testResult && !testResult.includes('ошибка') && !testResult.includes('error')) {
        await ctx.editMessageText('✅ API ключ работает корректно!\n\nТестовый запрос выполнен успешно. AI сервис готов к работе.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Назад', callback_data: 'admin_change_ai_key' }]
            ]
          }
        });
      } else {
        await ctx.editMessageText('❌ Проблема с API ключом!\n\nТестовый запрос завершился с ошибкой. Проверьте ключ и баланс аккаунта OpenAI.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить ключ', callback_data: 'change_ai_key_wizard' }],
              [{ text: '🔙 Назад', callback_data: 'admin_change_ai_key' }]
            ]
          }
        });
      }

    } catch (error) {
      await ctx.editMessageText(`❌ Ошибка при проверке API ключа:\n\n${error.message}\n\nПроверьте ключ и повторите попытку.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Изменить ключ', callback_data: 'change_ai_key_wizard' }],
            [{ text: '🔙 Назад', callback_data: 'admin_change_ai_key' }]
          ]
        }
      });
    }
  });

  // Перезапуск бота
  bot.action('admin_restart_bot', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const processInfo = BotManager.getProcessInfo();

      let message = '🔄 Управление перезапуском бота\n\n';
      message += `📊 Информация о процессе:\n`;
      message += `• PID: ${processInfo.pid}\n`;
      message += `• Время работы: ${Math.floor(processInfo.uptime / 60)} минут\n`;
      message += `• Память: ${(processInfo.memory.rss / 1024 / 1024).toFixed(2)} MB\n`;
      message += `• Перезапусков: ${processInfo.restartCount}\n`;
      message += `• PM2: ${processInfo.pm2 ? '✅' : '❌'}\n\n`;

      message += `⚠️ Внимание:\n`;
      message += `• Мягкий перезапуск перезагружает модули\n`;
      message += `• Полный перезапуск перезапускает процесс\n`;
      message += `• Во время перезапуска бот может быть недоступен\n`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Мягкий перезапуск', callback_data: 'soft_restart_bot' },
              { text: '🔄 Полный перезапуск', callback_data: 'full_restart_bot' }
            ],
            [
              { text: '📊 Статус системы', callback_data: 'admin_system_status' },
              { text: '🧹 Очистить кеш', callback_data: 'clear_bot_cache' }
            ],
            [
              { text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }
            ]
          ]
        }
      });

    } catch (error) {
      console.error('Restart bot error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке информации о перезапуске');
    }
  });

  // Мягкий перезапуск
  bot.action('soft_restart_bot', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      await ctx.editMessageText('🔄 Выполняется мягкий перезапуск...');

      const result = await BotManager.softRestart();

      if (result.success) {
        BotManager.logRestart(ctx.from.id, 'soft_restart');

        await ctx.editMessageText(`✅ ${result.message}\n\nОсновные модули перезагружены. Бот продолжает работу.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]
            ]
          }
        });
      } else {
        await ctx.editMessageText(`❌ Ошибка при мягком перезапуске: ${result.error}`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Назад', callback_data: 'admin_restart_bot' }]
            ]
          }
        });
      }

    } catch (error) {
      await ctx.editMessageText(`❌ Ошибка при мягком перезапуске: ${error.message}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'admin_restart_bot' }]
          ]
        }
      });
    }
  });

  // Полный перезапуск
  bot.action('full_restart_bot', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      await ctx.editMessageText('🔄 Подготовка к полному перезапуску...\n\n⚠️ Бот будет временно недоступен!');

      // Даем пользователю время прочитать сообщение
      setTimeout(async () => {
        const result = await BotManager.fullRestart();

        if (result.success) {
          await ctx.editMessageText(`✅ ${result.message}\n\nБот будет перезапущен. Подождите несколько секунд.`);
        } else {
          await ctx.editMessageText(`❌ Ошибка при перезапуске: ${result.error}`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Назад', callback_data: 'admin_restart_bot' }]
              ]
            }
          });
        }
      }, 2000);

    } catch (error) {
      await ctx.editMessageText(`❌ Ошибка при перезапуске: ${error.message}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'admin_restart_bot' }]
          ]
        }
      });
    }
  });

  // Статус системы
  bot.action('admin_system_status', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const processInfo = BotManager.getProcessInfo();
      const memoryUsage = process.memoryUsage();

      let message = '📊 Детальный статус системы\n\n';
      message += `🖥 Процесс:\n`;
      message += `• PID: ${processInfo.pid}\n`;
      message += `• Uptime: ${Math.floor(processInfo.uptime / 3600)}ч ${Math.floor((processInfo.uptime % 3600) / 60)}м\n`;
      message += `• Node.js: ${processInfo.nodeVersion}\n`;
      message += `• Платформа: ${processInfo.platform}\n\n`;

      message += `💾 Память:\n`;
      message += `• RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB\n`;
      message += `• Heap: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n`;
      message += `• External: ${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB\n\n`;

      message += `🔄 Перезапуски:\n`;
      message += `• Всего: ${processInfo.restartCount}\n`;
      message += `• PM2: ${processInfo.pm2 ? '✅' : '❌'}\n`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Мягкий перезапуск', callback_data: 'soft_restart_bot' },
              { text: '📊 Обновить', callback_data: 'admin_system_status' }
            ],
            [
              { text: '🔙 Назад', callback_data: 'admin_restart_bot' }
            ]
          ]
        }
      });

    } catch (error) {
      console.error('System status error:', error);
      await ctx.answerCbQuery('❌ Ошибка при получении статуса системы');
    }
  });

  // Логи системы
  bot.action('admin_system_logs', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const logFiles = await LogService.getLogFiles();
      const systemInfo = await LogService.getSystemInfo();

      let message = `📋 Системные логи и информация\n\n`;

      message += `🖥 Система:\n`;
      message += `• Память: ${systemInfo.memory.heapUsed} MB / ${systemInfo.memory.heapTotal} MB\n`;
      message += `• Время работы: ${systemInfo.uptime}\n`;
      message += `• Node.js: ${systemInfo.nodeVersion}\n`;
      message += `• PID: ${systemInfo.pid}\n\n`;

      message += `📁 Доступные логи:\n`;

      if (logFiles.length === 0) {
        message += `❌ Файлы логов не найдены\n`;
        message += `Логи будут создаваться автоматически при работе системы.`;
      } else {
        logFiles.forEach((file, index) => {
          message += `${index + 1}. ${file.name}\n`;
          message += `   📏 Размер: ${file.sizeFormatted}\n`;
          message += `   ⏰ Изменен: ${file.modified.toLocaleString('ru-RU')}\n\n`;
        });
      }

      const keyboard = [];

      if (logFiles.length > 0) {
        // Добавляем кнопки для каждого лог-файла
        logFiles.slice(0, 5).forEach((file, index) => {
          keyboard.push([
            {
              text: `📄 ${file.name}`,
              callback_data: `view_log_${file.name}`
            }
          ]);
        });

        keyboard.push([
          { text: '🔄 Обновить', callback_data: 'admin_system_logs' },
          { text: '🧹 Очистить все логи', callback_data: 'clear_all_logs' }
        ]);
      } else {
        keyboard.push([
          { text: '🔄 Обновить', callback_data: 'admin_system_logs' }
        ]);
      }

      keyboard.push([
        { text: '🔙 В системное меню', callback_data: 'admin_back_to_panel' }
      ]);

      await ctx.editMessageText(message, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('System logs error:', error);
      await ctx.editMessageText('❌ Ошибка при получении информации о логах', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад', callback_data: 'admin_system' }]
          ]
        }
      });
    }
  });

  // Просмотр конкретного лог-файла
  bot.action(/view_log_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const filename = ctx.match[1];
      const logContent = await LogService.readLogFile(filename, 30);

      let message = `📄 Лог-файл: *${filename}*\n\n`;
      message += `📊 Всего строк: ${logContent.totalLines}\n`;
      message += `📝 Показано последних: ${logContent.lines.length} строк\n\n`;

      if (logContent.lines.length === 0) {
        message += `📭 Файл пуст\n`;
      } else {
        // ПРАВИЛЬНОЕ ИСПОЛЬЗОВАНИЕ БЛОКА КОДА
        message += '```\n';
        logContent.lines.forEach(line => {
          message += `${LogService.formatLogLine(line)}\n`;
        });
        message += '```\n';
      }

      if (logContent.hasMore) {
        message += `\n⚠️ Показаны только последние 30 строк. Используйте экспорт для полной версии.`;
      }

      const keyboard = [
        [
          { text: '📥 Экспорт файла', callback_data: `export_log_${filename}` },
          { text: '🧹 Очистить', callback_data: `clear_log_${filename}` }
        ],
        [
          { text: '📋 Еще строки', callback_data: `more_log_${filename}_60` },
          { text: '📜 Все строки', callback_data: `export_log_${filename}` }
        ],
        [
          { text: '🔙 К списку логов', callback_data: 'admin_system_logs' }
        ]
      ];

      await ctx.editMessageText(message, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('View log error:', error);
      await ctx.answerCbQuery('❌ Ошибка при чтении лог-файла');
    }
  });

  // Показать больше строк лога
  bot.action(/more_log_(.+)_(\d+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const filename = ctx.match[1];
      const linesCount = parseInt(ctx.match[2]);
      const logContent = await LogService.readLogFile(filename, linesCount);

      let message = `📄 Лог-файл: *${filename}*\n\n`;
      message += `📊 Всего строк: ${logContent.totalLines}\n`;
      message += `📝 Показано последних: ${logContent.lines.length} строк\n\n`;

      // ПРАВИЛЬНОЕ ИСПОЛЬЗОВАНИЕ БЛОКА КОДА
      message += '```\n';
      logContent.lines.forEach(line => {
        message += `${LogService.formatLogLine(line)}\n`;
      });
      message += '```\n';

      if (logContent.hasMore) {
        message += `\n⚠️ Показаны только последние ${linesCount} строк.`;
      }

      const keyboard = [
        [
          { text: '📥 Экспорт файла', callback_data: `export_log_${filename}` },
          { text: '🧹 Очистить', callback_data: `clear_log_${filename}` }
        ]
      ];

      if (linesCount < 100) {
        keyboard[0].push({
          text: '📜 Еще строк',
          callback_data: `more_log_${filename}_${linesCount + 30}`
        });
      }

      keyboard.push([
        { text: '🔙 К списку логов', callback_data: 'admin_system_logs' }
      ]);

      await ctx.editMessageText(message, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('More log error:', error);
      await ctx.answerCbQuery('❌ Ошибка при чтении лог-файла');
    }
  });

  // Экспорт лог-файла
  bot.action(/export_log_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const filename = ctx.match[1];
      const filePath = path.join(__dirname, '../../logs', filename);

      if (!fs.existsSync(filePath)) {
        await ctx.answerCbQuery('❌ Файл не найден');
        return;
      }

      // Проверяем размер файла
      const stats = fs.statSync(filePath);
      if (stats.size > 50 * 1024 * 1024) { // 50MB limit
        await ctx.answerCbQuery('❌ Файл слишком большой для отправки');
        return;
      }

      await ctx.replyWithDocument({
        source: filePath,
        filename: `log_${filename}_${new Date().toISOString().split('T')[0]}.txt`
      });

      await ctx.answerCbQuery('✅ Файл отправлен');

    } catch (error) {
      console.error('Export log error:', error);
      await ctx.answerCbQuery('❌ Ошибка при экспорте файла');
    }
  });

  // Очистка лог-файла
  bot.action(/clear_log_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const filename = ctx.match[1];
      const success = await LogService.clearLogFile(filename);

      if (success) {
        await ctx.answerCbQuery('✅ Лог-файл очищен');
        // Обновляем сообщение
        await ctx.editMessageText(`✅ Лог-файл "${filename}" успешно очищен`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 К списку логов', callback_data: 'admin_system_logs' }]
            ]
          }
        });
      } else {
        await ctx.answerCbQuery('❌ Файл не найден');
      }

    } catch (error) {
      console.error('Clear log error:', error);
      await ctx.answerCbQuery('❌ Ошибка при очистке файла');
    }
  });

  // Очистка всех логов
  bot.action('clear_all_logs', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const logFiles = await LogService.getLogFiles();
      let clearedCount = 0;

      for (const file of logFiles) {
        try {
          await LogService.clearLogFile(file.name);
          clearedCount++;
        } catch (error) {
          console.error(`Error clearing ${file.name}:`, error);
        }
      }

      await ctx.answerCbQuery(`✅ Очищено ${clearedCount} файлов`);
      await ctx.editMessageText(`✅ Успешно очищено ${clearedCount} лог-файлов из ${logFiles.length}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 К списку логов', callback_data: 'admin_system_logs' }]
          ]
        }
      });

    } catch (error) {
      console.error('Clear all logs error:', error);
      await ctx.answerCbQuery('❌ Ошибка при очистке логов');
    }
  });

  // Управление пользователями (блокировка/разблокировка)
  bot.action(/admin_toggle_block_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    const userId = ctx.match[1];

    try {
      const user = await User.findById(userId);
      if (!user) {
        await ctx.answerCbQuery('❌ Пользователь не найден');
        return;
      }

      user.isBlocked = !user.isBlocked;
      await user.save();

      const action = user.isBlocked ? 'заблокирован' : 'разблокирован';
      await ctx.answerCbQuery(`✅ Пользователь ${action}`);
      await ctx.editMessageText(`✅ Пользователь ${user.firstName} ${action}!`);
    } catch (error) {
      console.error('Toggle block error:', error);
      await ctx.answerCbQuery('❌ Ошибка при изменении статуса');
    }
  });

  // Изменение тарифа пользователя
  bot.action(/admin_change_plan_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const userId = ctx.match[1];
      const user = await User.findById(userId);

      if (!user) {
        await ctx.answerCbQuery('❌ Пользователь не найден');
        return;
      }

      let message = `💎 Изменение тарифа для ${user.firstName}\n\n`;
      message += `Текущий тариф: ${SUBSCRIPTION_PLANS[user.subscription.plan]?.name || user.subscription.plan}\n\n`;
      message += `Выберите новый тариф:`;

      // СОЗДАЕМ ПРАВИЛЬНЫЙ ФОРМАТ КЛАВИАТУРЫ - массив массивов
      const keyboard = Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => {
        // Каждый тариф в отдельном массиве (ряду)
        return [{
          text: `${plan.name} (${plan.price > 0 ? `${plan.price} зв.` : 'Бесплатно'})`,
          callback_data: `set_user_plan_${userId}_${key}`
        }];
      });

      // Добавляем кнопку отмены в отдельный ряд
      keyboard.push([{ text: '❌ Отмена', callback_data: 'admin_back_to_panel' }]);

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });

    } catch (error) {
      console.error('Change plan error:', error);
      await ctx.answerCbQuery('❌ Ошибка при изменении тарифа');
    }
  });

  // Установка нового тарифа для пользователя
  bot.action(/set_user_plan_(.+)_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    try {
      const userId = ctx.match[1];
      const planKey = ctx.match[2];

      const user = await User.findById(userId);
      if (!user) {
        await ctx.answerCbQuery('❌ Пользователь не найден');
        return;
      }

      const plan = SUBSCRIPTION_PLANS[planKey];
      if (!plan) {
        await ctx.answerCbQuery('❌ Тариф не найден');
        return;
      }

      // Сохраняем старый тариф для истории
      const oldPlan = user.subscription.plan;

      // Обновляем подписку пользователя
      user.subscription.plan = planKey;
      user.subscription.isTrial = false;
      user.subscription.startDate = new Date();
      user.subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 дней

      // Обновляем лимиты
      user.limits.channels = plan.channels;
      user.limits.postsPerDay = plan.postsPerDay;
      user.limits.postsToday = 0; // Сбрасываем счетчик

      await user.save();

      await ctx.answerCbQuery(`✅ Тариф изменен на ${plan.name}`);

      const message = `✅ Тариф пользователя успешно изменен!\n\n` +
        `👤 Пользователь: ${user.firstName}${user.username ? ` (@${user.username})` : ''}\n` +
        `📊 Старый тариф: ${SUBSCRIPTION_PLANS[oldPlan]?.name || oldPlan}\n` +
        `🎯 Новый тариф: ${plan.name}\n` +
        `📅 Действует до: ${user.subscription.endDate.toLocaleDateString('ru-RU')}\n\n` +
        `📈 Новые лимиты:\n` +
        `• Каналов: ${plan.channels}\n` +
        `• Постов в день: ${plan.postsPerDay}\n` +
        `• AI-генерация: ${plan.aiAccess ? '✅' : '❌'}`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '👥 К пользователям', callback_data: 'admin_users' }],
            [{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]
          ]
        }
      });

    } catch (error) {
      console.error('Set user plan error:', error);
      await ctx.answerCbQuery('❌ Ошибка при установке тарифа');
    }
  });

  // Сброс пробного периода
  bot.action(/admin_reset_trial_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    const userId = ctx.match[1];

    try {
      const user = await User.findById(userId);
      if (!user) {
        await ctx.answerCbQuery('❌ Пользователь не найден');
        return;
      }

      user.subscription.isTrial = true;
      user.subscription.trialEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await user.save();

      await ctx.answerCbQuery('✅ Пробный период сброшен');
      await ctx.editMessageText(`✅ Пробный период для ${user.firstName} сброшен!\nНовый период до: ${user.subscription.trialEndDate.toLocaleDateString('ru-RU')}`);
    } catch (error) {
      console.error('Reset trial error:', error);
      await ctx.answerCbQuery('❌ Ошибка при сбросе пробного периода');
    }
  });

  // ==================== ПОЛЬЗОВАТЕЛЬСКИЕ ОБРАБОТЧИКИ ====================

  // Главное меню
  bot.action('main_menu', async (ctx) => {
    try {
      await ctx.editMessageText('Главное меню:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Мои каналы', callback_data: `📊 Мои каналы` },
              { text: '⚙️ Настройки', callback_data: `⚙️ Настройки` },
              { text: '💎 Тарифы', callback_data: `💎 Тарифы` },
              { text: '🆘 Помощь', callback_data: `🆘 Помощь` },
            ]
          ]
        }
      });
      await ctx.reply('Выберите действие:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Мои каналы', callback_data: `📊 Мои каналы` },
              { text: '⚙️ Настройки', callback_data: `⚙️ Настройки` },
              { text: '💎 Тарифы', callback_data: `💎 Тарифы` },
              { text: '🆘 Помощь', callback_data: `🆘 Помощь` }
            ]
          ]
        }
      });
    } catch (error) {
      await ctx.reply('Главное меню:', {
        reply_markup: userMainKeyboard
      });
    }
  });

  // Добавление канала
  bot.action('add_channel', async (ctx) => {
    await ctx.editMessageText(`Чтобы добавить канал:

1. Добавьте @${ctx.botInfo.username} как администратора в ваш канал
2. Дайте права на отправку сообщений
3. Перешлите любое сообщение из канала в этот чат

После этого канал автоматически подключится к системе.`);
  });

  // Управление каналами
  bot.action('manage_channels', async (ctx) => {
    const channels = await Channel.find({ owner: ctx.user._id });

    let message = '⚙️ Управление каналами:\n\n';
    const keyboard = [];

    channels.forEach(channel => {
      // Безопасная проверка всех полей
      const hasSchedule = channel.schedule && typeof channel.schedule.enabled !== 'undefined';
      const scheduleStatus = hasSchedule && channel.schedule.enabled ?
        `⏰ ${(channel.schedule.times || []).length} раз в день` : '❌ Выкл';

      const mode = channel.settings?.mode || 'combined';
      const rssCount = channel.rssSources?.length || 0;

      message += `🔸 ${channel.title}\n`;
      message += `Режим: ${mode}\n`;
      message += `RSS: ${rssCount} источников\n`;
      message += `Расписание: ${scheduleStatus}\n\n`;

      keyboard.push([
        {
          text: `⚙️ ${channel.title.substring(0, 20)}`,
          callback_data: `channel_detail_${channel._id}`
        }
      ]);
    });

    keyboard.push([{ text: '🔙 Назад', callback_data: 'main_menu' }]);

    await ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard }
    });
  });

  // // Детальная информация о канале
  // bot.action(/channel_detail_(.+)/, async (ctx) => {
  //   const channelId = ctx.match[1];
  //   const channel = await Channel.findById(channelId);

  //   if (!channel) {
  //     await ctx.answerCbQuery('❌ Канал не найден');
  //     return;
  //   }

  //   if (channel.owner.toString() !== ctx.user._id.toString()) {
  //     await ctx.answerCbQuery('❌ Доступ запрещен');
  //     return;
  //   }

  //   const message = `📊 Канал: ${channel.title}\n\n` +
  //     `🔧 Режим: ${channel.settings.mode}\n` +
  //     `📰 RSS источников: ${channel.rssSources.length}\n` +
  //     `🤖 AI стиль: ${channel.aiSettings.tone}\n` +
  //     `🚀 Автопостинг: ${channel.settings.autoPublish ? '✅' : '❌'}\n` +
  //     `📈 Постов всего: ${channel.statistics?.totalPosts || 0}\n\n` +
  //     `Выберите действие:`;

  //   await ctx.editMessageText(message, {
  //     reply_markup: channelDetailKeyboard(channelId)
  //   });
  // });

  // Настройки канала
  bot.action(/channel_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    const message = `⚙️ Настройки канала: ${channel.title}\n\n` +
      `Текущий режим: ${channel.settings.mode}\n` +
      `Автопостинг: ${channel.settings.autoPublish ? '✅ Включен' : '❌ Выключен'}\n` +
      `Расписание: ${channel.settings.schedule.enabled ? '✅ Включено' : '❌ Выключено'}\n\n` +
      `Выберите раздел для настройки:`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Автопостинг',
              callback_data: `autopost_settings_${channel._id}`
            },
            {
              text: '🔧 Режим работы',
              callback_data: `mode_settings_${channel._id}`
            }
          ],
          [
            {
              text: '📰 RSS источники',
              callback_data: `manage_rss_${channel._id}`
            },
            {
              text: '🤖 AI настройки',
              callback_data: `ai_settings_${channel._id}`
            }
          ],
          [
            {
              text: '🔙 Назад',
              callback_data: `channel_detail_${channel._id}`
            }
          ]
        ]
      }
    });
  });

  // Смена режима канала
  bot.action(/set_mode_(.+)_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const mode = ctx.match[2];

    const channel = await Channel.findById(channelId);
    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    channel.settings.mode = mode;
    await channel.save();

    await ctx.answerCbQuery(`✅ Режим изменен на: ${mode}`);
    await ctx.editMessageText(`✅ Режим канала "${channel.title}" изменен на: ${mode}\n\nКанал готов к работе!`);
  });

  // // Переключение автопостинга
  // bot.action(/toggle_autopost_(.+)/, async (ctx) => {
  //   const channelId = ctx.match[1];

  //   const channel = await Channel.findById(channelId);
  //   if (!channel) {
  //     await ctx.answerCbQuery('❌ Канал не найден');
  //     return;
  //   }

  //   channel.settings.autoPublish = !channel.settings.autoPublish;
  //   await channel.save();

  //   const status = channel.settings.autoPublish ? 'включен' : 'выключен';
  //   await ctx.answerCbQuery(`✅ Автопостинг ${status}`);
  //   await ctx.editMessageText(`✅ Автопостинг для канала "${channel.title}" ${status}!`);
  // });

  // Управление RSS
  bot.action(/manage_rss_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    let message = `📰 RSS источники для: ${channel.title}\n\n`;

    if (channel.rssSources.length === 0) {
      message += '❌ Нет добавленных RSS источников\n\n';
    } else {
      channel.rssSources.forEach((source, index) => {
        message += `${index + 1}. ${source.url}\n`;
        message += `   Включить: ${source.includeKeywords.join(', ') || 'все'}\n`;
        message += `   Исключить: ${source.excludeKeywords.join(', ') || 'нет'}\n\n`;
      });
    }

    message += 'Выберите действие:';

    await ctx.editMessageText(message, {
      reply_markup: rssManagementKeyboard(channelId, channel.rssSources.length > 0)
    });
  });

  // Удаление канала - подтверждение
  bot.action(/delete_channel_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    const message = `🗑️ Удаление канала: ${channel.title}\n\n` +
      `⚠️ Внимание! Это действие нельзя отменить.\n` +
      `Будет удалено:\n` +
      `• Настройки канала\n` +
      `• RSS источники: ${channel.rssSources.length}\n` +
      `• Статистика\n\n` +
      `Вы уверены, что хотите удалить канал?`;

    await ctx.editMessageText(message, {
      reply_markup: deleteConfirmKeyboard(channelId)
    });
  });

  // Подтверждение удаления канала
  bot.action(/confirm_delete_channel_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      const channel = await Channel.findById(channelId);

      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      if (channel.owner.toString() !== ctx.user._id.toString()) {
        await ctx.answerCbQuery('❌ Доступ запрещен');
        return;
      }

      const channelTitle = channel.title;

      // Удаляем канал из базы данных
      await Channel.findByIdAndDelete(channelId);

      await ctx.answerCbQuery('✅ Канал удален');
      await ctx.editMessageText(`✅ Канал "${channelTitle}" успешно удален!`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 К моим каналам', callback_data: 'manage_channels' }],
            [{ text: '🔙 В главное меню', callback_data: 'main_menu' }]
          ]
        }
      });

    } catch (error) {
      console.error('Delete channel error:', error);
      await ctx.answerCbQuery('❌ Ошибка при удалении канала');
      await ctx.editMessageText('❌ Произошла ошибка при удалении канала. Попробуйте позже.');
    }
  });

  // Запуск сцены добавления RSS
  bot.action(/rss_setup_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    await ctx.editMessageText('📥 Выберите тип добавления RSS:', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '⚡ Быстрое добавление',
              callback_data: `quick_rss_setup_${channelId}`
            },
            {
              text: '🎯 С настройкой фильтров',
              callback_data: `full_rss_setup_${channelId}`
            }
          ],
          [
            {
              text: '🔙 Назад',
              callback_data: `manage_rss_${channelId}`
            }
          ]
        ]
      }
    });
  });

  // Быстрое добавление
  bot.action(/quick_rss_setup_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    await ctx.scene.enter('quick-rss-setup-scene', { channelId });
    await ctx.answerCbQuery();
  });

  // Полное добавление с фильтрами
  bot.action(/full_rss_setup_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    await ctx.scene.enter('rss-setup-scene', { channelId });
    await ctx.answerCbQuery();
  });

  // Настройки AI
  bot.action(/ai_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    const message = `🤖 Настройки AI для: ${channel.title}\n\n` +
      `Текущий стиль: ${channel.aiSettings.tone}\n` +
      `Темы: ${channel.aiSettings.topics.join(', ') || 'не заданы'}\n\n` +
      `Выберите действие:`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🎨 Стиль генерации', callback_data: `ai_style_menu_${channel._id}` },
            { text: '📝 Настроить темы', callback_data: `ai_topics_setup_${channel._id}` }
          ],
          [
            { text: '🔙 Назад', callback_data: `channel_detail_${channel._id}` }
          ]
        ]
      }
    });
  });

  // Меню выбора стиля AI
  bot.action(/ai_style_menu_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    const message = `🎨 Выберите стиль AI для: ${channel.title}\n\n` +
      `Текущий стиль: ${channel.aiSettings.tone}\n\n` +
      `Доступные стили:`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💼 Проф', callback_data: `set_ai_tone_${channel._id}_professional` },
            { text: '😄 Юмор', callback_data: `set_ai_tone_${channel._id}_humorous` }
          ],
          [
            { text: '📰 Новости', callback_data: `set_ai_tone_${channel._id}_news` },
            { text: '🎯 Реклама', callback_data: `set_ai_tone_${channel._id}_advertising` }
          ],
          [
            { text: '🎓 Образование', callback_data: `set_ai_tone_${channel._id}_educational` },
            { text: '🎭 Креатив', callback_data: `set_ai_tone_${channel._id}_creative` }
          ],
          [
            { text: '🔙 Назад', callback_data: `ai_settings_${channel._id}` }
          ]
        ]
      }
    });
  });

  // Смена стиля AI
  bot.action(/set_ai_tone_(.+)_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const tone = ctx.match[2];

    const channel = await Channel.findById(channelId);
    channel.aiSettings.tone = tone;
    await channel.save();

    await ctx.answerCbQuery(`✅ Стиль изменен на: ${tone}`);

    const message = `✅ Стиль AI для канала "${channel.title}" изменен на: ${tone}\n\n` +
      `Текущие настройки:\n` +
      `• Стиль: ${channel.aiSettings.tone}\n` +
      `• Темы: ${channel.aiSettings.topics.join(', ') || 'не заданы'}`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⚙️ Настройки AI', callback_data: `ai_settings_${channel._id}` },
            { text: '📝 Сгенерировать пост', callback_data: `ai_generate_${channel._id}` }
          ]
        ]
      }
    });
  });

  // Настройка тем AI
  bot.action(/ai_topics_setup_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    console.log(`🔧 Запуск настройки тем AI для канала: ${channel.title}`);

    const message = `📝 Настройка тем AI для: ${channel.title}\n\n` +
      `Текущие темы: ${channel.aiSettings.topics.join(', ') || 'не заданы'}\n\n` +
      `Отправьте список тем через запятую.\n` +
      `Пример: "технологии, программирование, IT новости"`;

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ Отмена', callback_data: `ai_settings_${channel._id}` }
          ]
        ]
      }
    });

    // Сохраняем ID канала в сессии для последующей обработки
    ctx.session.pendingAiTopics = channelId;
    console.log(`📝 Установлен pendingAiTopics: ${channelId}`);

    await ctx.answerCbQuery('✅ Готов к вводу тем');
  });

  // // Запуск сцены генерации AI поста
  // bot.action(/ai_generate_(.+)/, async (ctx) => {
  //   const channelId = ctx.match[1];

  //   try {
  //     const user = await UserService.getOrCreateUser(ctx.from);

  //     if (!user.subscription.isTrial && !user.subscription.aiAccess) {
  //       await ctx.answerCbQuery('❌ AI-генерация доступна только на платных тарифах');
  //       return;
  //     }

  //     const canPost = await UserService.canUserPost(user);
  //     if (!canPost) {
  //       await ctx.answerCbQuery('❌ Вы достигли дневного лимита постов');
  //       return;
  //     }

  //     await ctx.answerCbQuery();
  //     await ctx.scene.enter('ai-post-scene', {
  //       channelId: channelId,
  //       user: user
  //     });
  //   } catch (error) {
  //     console.error('Error entering AI scene:', error);
  //     await ctx.answerCbQuery('❌ Ошибка при запуске генерации');
  //   }
  // });

  // Статистика каналов
  bot.action('channel_stats', async (ctx) => {
    const channels = await Channel.find({ owner: ctx.user._id });

    let message = `📊 Статистика:\n\n` +
      `Каналов: ${channels.length}/${ctx.user.limits.channels}\n` +
      `Постов сегодня: ${ctx.user.limits.postsToday}/${ctx.user.limits.postsPerDay}\n` +
      `Режим: ${ctx.user.subscription.isTrial ? 'Пробный' : ctx.user.subscription.plan}\n\n`;

    if (channels.length > 0) {
      message += `Ваши каналы:\n`;
      channels.forEach(channel => {
        message += `• ${channel.title} (${channel.settings.mode})\n`;
      });
    }

    await ctx.editMessageText(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад', callback_data: 'main_menu' }]
        ]
      }
    });
  });

  // Удаление RSS
  bot.action(/delete_rss_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    if (channel.rssSources.length === 0) {
      await ctx.answerCbQuery('❌ Нет RSS источников для удаления');
      return;
    }

    const message = `🗑️ Удаление RSS источника\n\n` +
      `Выберите RSS источник для удаления:`;

    await ctx.editMessageText(message, {
      reply_markup: rssDeleteSelectionKeyboard(channel, channelId)
    });
  });

  // Подтверждение удаления RSS источника
  bot.action(/confirm_delete_rss_(.+)_(\d+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const rssIndex = parseInt(ctx.match[2]);

    try {
      const channel = await Channel.findById(channelId);

      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      if (rssIndex >= channel.rssSources.length) {
        await ctx.answerCbQuery('❌ RSS источник не найден');
        return;
      }

      const deletedRss = channel.rssSources[rssIndex];

      // Удаляем RSS источник из массива
      channel.rssSources.splice(rssIndex, 1);
      await channel.save();

      await ctx.answerCbQuery('✅ RSS источник удален');

      const message = `✅ RSS источник успешно удален!\n\n` +
        `URL: ${deletedRss.url}\n` +
        `Канал: ${channel.title}`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📰 К RSS источникам', callback_data: `manage_rss_${channel._id}` }],
            [{ text: '🔙 К каналу', callback_data: `channel_detail_${channel._id}` }]
          ]
        }
      });

    } catch (error) {
      console.error('Delete RSS error:', error);
      await ctx.answerCbQuery('❌ Ошибка при удалении RSS источника');
    }
  });

  // ==================== ТЕКСТОВЫЕ ОБРАБОТЧИКИ ====================

  bot.on('text', async (ctx) => {
    console.log('📨 Текстовое сообщение от:', ctx.from.first_name, 'Текст:', ctx.message.text);

    // 1. Обработка настройки тем AI
    if (ctx.session.pendingAiTopics) {
      const channelId = ctx.session.pendingAiTopics;
      const messageText = ctx.message.text;

      console.log(`🔧 Обработка тем AI для канала ${channelId}: ${messageText}`);

      // Очищаем сессию сразу
      delete ctx.session.pendingAiTopics;

      try {
        const channel = await Channel.findById(channelId);
        if (!channel) {
          await ctx.reply('❌ Канал не найден');
          return;
        }

        // Разделяем темы по запятым
        const topics = messageText.split(',')
          .map(topic => topic.trim())
          .filter(topic => topic.length > 0);

        if (topics.length === 0) {
          await ctx.reply('❌ Пожалуйста, укажите темы через запятую');
          return;
        }

        channel.aiSettings.topics = topics;
        await channel.save();

        console.log(`✅ Темы AI обновлены для канала ${channel.title}: ${topics.join(', ')}`);

        await ctx.reply(`✅ Темы AI для канала "${channel.title}" обновлены:\n\n${topics.join(', ')}`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔙 К настройкам AI', callback_data: `ai_settings_${channel._id}` },
                { text: '📝 Сгенерировать пост', callback_data: `ai_generate_${channel._id}` }
              ]
            ]
          }
        });

      } catch (error) {
        console.error('Error setting AI topics:', error);
        await ctx.reply('❌ Ошибка при обновлении тем');
      }
      return;
    }

    // 2. Обработка расписания
    if (ctx.session.waitingForScheduleTime && ctx.session.scheduleChannelId) {
      console.log('🕒 Обработка времени расписания');

      const input = ctx.message.text.trim();

      if (input.toLowerCase() === 'отмена') {
        delete ctx.session.waitingForScheduleTime;
        delete ctx.session.scheduleChannelId;
        await ctx.reply('❌ Настройка расписания отменена');
        return;
      }

      const times = input.split(',').map(t => t.trim());
      const validTimes = [];
      const invalidTimes = [];

      // Валидация времени
      for (const time of times) {
        if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
          validTimes.push(time);
        } else {
          invalidTimes.push(time);
        }
      }

      if (validTimes.length === 0) {
        await ctx.reply('❌ Неверный формат времени. Используйте ЧЧ:MM (например, 09:00)');
        return;
      }

      const channel = await Channel.findById(ctx.session.scheduleChannelId);
      if (!channel) {
        await ctx.reply('❌ Канал не найден');
        return;
      }

      // Инициализируем settings и schedule если их нет
      if (!channel.settings) {
        channel.settings = {
          mode: 'combined',
          autoPublish: true,
          schedule: {
            enabled: false,
            times: []
          }
        };
      } else if (!channel.settings.schedule) {
        channel.settings.schedule = {
          enabled: false,
          times: []
        };
      }

      // Обновляем время
      const schedule = channel.settings.schedule;
      const existingTimes = new Set(schedule.times || []);
      validTimes.forEach(time => existingTimes.add(time));
      schedule.times = Array.from(existingTimes).sort();

      try {
        await channel.save();

        let message = `✅ Время добавлено в расписание:\n` +
          validTimes.map(t => `🕒 ${t}`).join('\n');

        if (invalidTimes.length > 0) {
          message += `\n\n❌ Некорректное время (игнорировано): ${invalidTimes.join(', ')}`;
        }

        // Сбрасываем состояние
        delete ctx.session.waitingForScheduleTime;
        delete ctx.session.scheduleChannelId;

        await ctx.reply(message);

        // Показываем обновленное расписание
        const scheduleText = schedule.times.length > 0 ?
          schedule.times.map(time => `🕒 ${time}`).join('\n') :
          '❌ Расписание не настроено';

        await ctx.reply(`📅 Текущее расписание:\n${scheduleText}\n\nСтатус: ${schedule.enabled ? '✅ Включено' : '❌ Выключено'}`);

      } catch (error) {
        console.error('❌ Error saving channel:', error);
        await ctx.reply('❌ Ошибка при сохранении расписания');
      }
      return;
    }

    // 3. Поиск пользователей для админа
    if (ctx.session.waitingForUserSearch) {
      const searchTerm = ctx.message.text;
      delete ctx.session.waitingForUserSearch;

      let user;

      // Поиск по ID
      if (/^\d+$/.test(searchTerm)) {
        user = await User.findOne({ telegramId: parseInt(searchTerm) });
      }
      // Поиск по username
      else if (searchTerm.startsWith('@')) {
        user = await User.findOne({ username: searchTerm.substring(1) });
      }
      // Поиск по тексту
      else {
        user = await User.findOne({
          $or: [
            { firstName: { $regex: searchTerm, $options: 'i' } },
            { username: { $regex: searchTerm, $options: 'i' } }
          ]
        });
      }

      if (!user) {
        await ctx.reply('❌ Пользователь не найден');
        return;
      }

      const message = `👤 Информация о пользователе:\n\n` +
        `Имя: ${user.firstName}${user.lastName ? ' ' + user.lastName : ''}\n` +
        `Username: @${user.username || 'не указан'}\n` +
        `ID: ${user.telegramId}\n` +
        `Тариф: ${user.subscription.plan}\n` +
        `Пробный период: ${user.subscription.isTrial ? '✅ до ' + user.subscription.trialEndDate.toLocaleDateString('ru-RU') : '❌'}\n` +
        `Заблокирован: ${user.isBlocked ? '✅' : '❌'}\n` +
        `Регистрация: ${user.createdAt.toLocaleDateString('ru-RU')}`;

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✏️ Изменить тариф', callback_data: `admin_change_plan_${user._id}` },
              { text: user.isBlocked ? '🔓 Разблокировать' : '🔒 Заблокировать', callback_data: `admin_toggle_block_${user._id}` }
            ],
            [
              { text: '🔄 Сбросить пробный', callback_data: `admin_reset_trial_${user._id}` }
            ]
          ]
        }
      });
      return;
    }

    // 4. Обработка пересланных сообщений для добавления каналов
    if (ctx.message.forward_from_chat && ctx.message.forward_from_chat.type === 'channel') {
      try {
        const chat = ctx.message.forward_from_chat;

        // Проверяем, является ли бот администратором канала
        const chatMember = await ctx.telegram.getChatMember(chat.id, ctx.botInfo.id);

        if (chatMember.status !== 'administrator') {
          await ctx.reply('❌ Бот не является администратором этого канала. Добавьте бота как администратора с правами на отправку сообщений.');
          return;
        }

        // Проверяем лимиты пользователя
        const canAddChannel = await UserService.canUserAddChannel(ctx.user);
        if (!canAddChannel) {
          await ctx.reply(`❌ Вы достигли лимита каналов (${ctx.user.limits.channels}). Улучшите тариф для добавления большего количества каналов.`);
          return;
        }

        // Проверяем, не добавлен ли канал уже
        const existingChannel = await Channel.findOne({
          channelId: chat.id,
          owner: ctx.user._id
        });

        if (existingChannel) {
          await ctx.reply('❌ Этот канал уже добавлен в систему.');
          return;
        }

        // Создаем новый канал
        const newChannel = new Channel({
          title: chat.title,
          channelId: chat.id,
          owner: ctx.user._id,
          settings: {
            mode: 'combined',
            autoPublish: true,
            schedule: {
              enabled: false,
              times: []
            }
          },
          aiSettings: {
            tone: 'professional',
            topics: []
          },
          rssSources: []
        });

        await newChannel.save();

        await ctx.reply(`✅ Канал "${chat.title}" успешно добавлен!\n\nТеперь вы можете настроить RSS источники и режим работы.`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '⚙️ Настроить канал', callback_data: `channel_detail_${newChannel._id}` },
                { text: '📰 Добавить RSS', callback_data: `rss_setup_${newChannel._id}` }
              ]
            ]
          }
        });

      } catch (error) {
        console.error('Error adding channel:', error);
        await ctx.reply('❌ Ошибка при добавлении канала. Убедитесь, что бот добавлен как администратор.');
      }
      return;
    }

    // 5. Проверяем, не находится ли пользователь в сцене
    if (ctx.session.__scenes?.current) {
      console.log(`⏩ Пропускаем текст, пользователь в сцене: ${ctx.session.__scenes.current}`);
      return;
    }

    // 6. Если ни одно условие не сработало, игнорируем сообщение
    console.log('ℹ️ Сообщение не обработано ни одним обработчиком');
  });

}

module.exports = setupAllHendlers;