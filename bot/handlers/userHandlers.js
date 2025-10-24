const User = require('../../models/User');
const Channel = require('../../models/Channel');
const UserService = require('../../services/UserService');
const AIService = require('../../services/AIService');
const { userMainKeyboard, aiTonesKeyboard, postTypesKeyboard, adminMainKeyboard } = require('../keyboards/keyboards');
const { BOT_CONFIG, SUBSCRIPTION_PLANS, POST_TYPES, AI_PROMPTS } = require('../../config');

function setupUserHandlers(bot) {
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
3. Перешлите любое сообщение из канала в этот чат`);
    }

    let message = `📊 Ваши каналы (${channels.length}/${ctx.user.limits.channels}):\n\n`;

    for (const channel of channels) {
      // Безопасная проверка расписания (теперь внутри settings)
      const schedule = channel.settings?.schedule || {};
      const scheduleStatus = schedule.enabled ? 
        `⏰ ${(schedule.times || []).length} раз в день` : '❌ Выкл';

      message += `🔸 ${channel.title}\n`;
      message += `Режим: ${channel.settings?.mode || 'combined'}\n`;
      message += `RSS источников: ${channel.rssSources?.length || 0}\n`;
      message += `Расписание: ${scheduleStatus}\n\n`;
    }

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить канал', callback_data: 'add_channel' }],
          [{ text: '⚙️ Управление каналами', callback_data: 'manage_channels' }],
          [{ text: '⏰ Настроить расписание', callback_data: 'schedule_menu' }]
        ]
      }
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

  // Обработка ввода времени расписания
  bot.on('text', async (ctx) => {
    if (ctx.session && ctx.session.waitingForScheduleTime) {
      console.log('🕒 Processing schedule time input:', {
        session: ctx.session,
        input: ctx.message.text,
        channelId: ctx.session.scheduleChannelId
      });

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

      console.log('📋 Channel before update:', {
        title: channel.title,
        settings: channel.settings,
        hasSchedule: !!(channel.settings?.schedule)
      });

      // Инициализируем settings и schedule если их нет (теперь внутри settings)
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

      // Безопасная работа с times (теперь внутри settings.schedule)
      const schedule = channel.settings.schedule;
      const existingTimes = new Set(schedule.times || []);
      const beforeCount = existingTimes.size;
      validTimes.forEach(time => existingTimes.add(time));
      const afterCount = existingTimes.size;
      
      schedule.times = Array.from(existingTimes).sort();

      console.log('📝 Times update:', {
        validTimes,
        beforeCount,
        afterCount,
        finalTimes: schedule.times
      });

      try {
        await channel.save();
        console.log('💾 Channel saved successfully');
        
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
        return;
      }

    } else if (ctx.session && ctx.session.waitingForAITopic) {
      // Обработка текста для AI
      const topic = ctx.message.text;
      const tone = ctx.session.aiTone || 'professional';
      const postType = ctx.session.postType || 'news';

      await ctx.reply('🔄 Генерирую пост...');

      try {
        const post = await AIService.generatePost(topic, tone, postType);

        await ctx.reply(`✅ Сгенерированный пост (${POST_TYPES[postType].name}):\n\n${post}\n\nВы можете скопировать этот текст и опубликовать в вашем канале.`);

        // Сбрасываем состояние
        delete ctx.session.waitingForAITopic;
        delete ctx.session.aiTone;
        delete ctx.session.postType;

      } catch (error) {
        await ctx.reply('❌ Произошла ошибка при генерации поста. Попробуйте позже.');
      }
    }
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

  // Обработка выбора стиля AI
  bot.action(/ai_tone_(.+)/, async (ctx) => {
    const tone = ctx.match[1];
    ctx.session = ctx.session || {};
    ctx.session.aiTone = tone;

    const postType = ctx.session.postType || 'news';
    const postTypeInfo = POST_TYPES[postType];

    await ctx.editMessageText(
      `📝 Тип: ${postTypeInfo.name}\n` +
      `🎨 Стиль: ${tone}\n\n` +
      `Теперь отправьте тему для поста.\n\n` +
      `💡 Рекомендации:\n` +
      `• Будьте конкретны в описании темы\n` +
      `• Укажите ключевые моменты\n` +
      `• Добавьте контекст, если необходимо\n\n` +
      `Например: "${postTypeInfo.examples[0]}"`
    );
    ctx.session.waitingForAITopic = true;
  });

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

  // Настройки канала
  bot.action(/channel_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    const message = `⚙️ Настройки канала: ${channel.title}\n\n` +
      `Текущий режим: ${channel.settings.mode}\n` +
      `Выберите новый режим работы:`;

    await ctx.editMessageText(message, {
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
            { text: '🔄 Автопостинг', callback_data: `toggle_autopost_${channel._id}` }
          ],
          [
            { text: '🔙 Назад', callback_data: `channel_detail_${channel._id}` }
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
}

module.exports = setupUserHandlers;