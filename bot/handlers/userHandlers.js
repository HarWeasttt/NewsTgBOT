const User = require('../../models/User');
const Channel = require('../../models/Channel');
const UserService = require('../../services/UserService');
const AIService = require('../../services/AIService');
const { userMainKeyboard, aiTonesKeyboard, adminMainKeyboard } = require('../keyboards/keyboards');
const { BOT_CONFIG, SUBSCRIPTION_PLANS } = require('../../config');

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
      message += `🔸 ${channel.title}\n`;
      message += `Режим: ${channel.settings.mode}\n`;
      message += `RSS источников: ${channel.rssSources.length}\n`;
      message += `Автопостинг: ${channel.settings.autoPublish ? '✅' : '❌'}\n\n`;
    }

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить канал', callback_data: 'add_channel' }],
          [{ text: '⚙️ Управление каналами', callback_data: 'manage_channels' }]
        ]
      }
    });
  });

  bot.hears('🤖 AI Генерация', async (ctx) => {
    // Получаем актуальные данные пользователя из БД
    const currentUser = await User.findById(ctx.user._id);
    const userPlan = SUBSCRIPTION_PLANS[currentUser.subscription.plan];

    console.log('🔍 AI Access Check:', {
      plan: currentUser.subscription.plan,
      isTrial: currentUser.subscription.isTrial,
      aiAccess: userPlan?.aiAccess,
      trialEndDate: currentUser.subscription.trialEndDate,
      now: new Date()
    });

    // Проверяем доступ к AI
    const hasAIAccess = currentUser.subscription.isTrial || userPlan?.aiAccess;

    if (!hasAIAccess) {
      return ctx.reply('❌ AI-генерация доступна только на платных тарифах. Обновите подписку!');
    }

    await ctx.reply('🎯 Выберите стиль поста:', {
      reply_markup: aiTonesKeyboard
    });
  });

  // Обработка выбора стиля AI
  bot.action(/ai_tone_(.+)/, async (ctx) => {
    const tone = ctx.match[1];
    ctx.session = ctx.session || {};
    ctx.session.aiTone = tone;

    await ctx.editMessageText(`Выбран стиль: ${tone}\n\nТеперь отправьте тему для поста:`);
    ctx.session.waitingForAITopic = true;
  });

  // Обработка текста для AI
  bot.on('text', async (ctx) => {
    if (ctx.session && ctx.session.waitingForAITopic) {
      const topic = ctx.message.text;
      const tone = ctx.session.aiTone || 'professional';

      await ctx.reply('🔄 Генерирую пост...');

      try {
        const post = await AIService.generatePost(topic, tone);

        await ctx.reply(`✅ Сгенерированный пост:\n\n${post}\n\nВы можете скопировать этот текст и опубликовать в вашем канале.`);

        // Сбрасываем состояние
        delete ctx.session.waitingForAITopic;
        delete ctx.session.aiTone;

      } catch (error) {
        await ctx.reply('❌ Произошла ошибка при генерации поста. Попробуйте позже.');
      }
    }
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

  // AI Генерация с выбором канала - ИСПРАВЛЕННАЯ ВЕРСИЯ
  bot.action(/ai_generate_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    try {
      // Получаем актуальные данные пользователя
      const currentUser = await User.findById(ctx.user._id);
      const userPlan = SUBSCRIPTION_PLANS[currentUser.subscription.plan];

      console.log('🔍 AI Generate Check:', {
        userId: currentUser.telegramId,
        plan: currentUser.subscription.plan,
        isTrial: currentUser.subscription.isTrial,
        aiAccess: userPlan?.aiAccess
      });

      // Проверяем доступ к AI
      const hasAIAccess = currentUser.subscription.isTrial || userPlan?.aiAccess;
      if (!hasAIAccess) {
        await ctx.answerCbQuery('❌ AI-генерация доступна только на платных тарифах');
        return;
      }

      // Проверяем дневной лимит
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
      message += `🔸 ${channel.title}\n`;
      message += `Режим: ${channel.settings.mode}\n`;
      message += `RSS: ${channel.rssSources.length} источников\n\n`;

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

    const message = `📊 Канал: ${channel.title}\n\n` +
      `🔧 Режим: ${channel.settings.mode}\n` +
      `📰 RSS источников: ${channel.rssSources.length}\n` +
      `🤖 AI стиль: ${channel.aiSettings.tone}\n` +
      `🚀 Автопостинг: ${channel.settings.autoPublish ? '✅' : '❌'}\n\n` +
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
            { text: '⚙️ Настройки', callback_data: `channel_settings_${channel._id}` }
          ],
          [
            { text: '🔙 Назад', callback_data: 'manage_channels' }
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

  // Настройки AI для канала
  bot.action(/ai_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const channel = await Channel.findById(channelId);

    const message = `🤖 Настройки AI для: ${channel.title}\n\n` +
      `Текущий стиль: ${channel.aiSettings.tone}\n` +
      `Темы: ${channel.aiSettings.topics.join(', ') || 'не заданы'}\n\n` +
      `Выберите стиль генерации:`;

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
            { text: '🎓 Образование', callback_data: `set_ai_tone_${channel._id}_educational` }
          ],
          [
            { text: '🔙 Назад', callback_data: `channel_detail_${channel._id}` }
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
    if (!channel) {
      await ctx.answerCbQuery('❌ Канал не найден');
      return;
    }

    channel.aiSettings.tone = tone;
    await channel.save();

    await ctx.answerCbQuery(`✅ Стиль изменен на: ${tone}`);
    await ctx.editMessageText(`✅ Стиль AI для канала "${channel.title}" изменен на: ${tone}`);
  });

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

  // Удаление RSS (заглушка)
  bot.action(/delete_rss_(.+)/, async (ctx) => {
    await ctx.answerCbQuery('🗑️ Удаление RSS будет доступно в следующем обновлении');
  });

  // Настройки расписания (заглушка)
  bot.action(/schedule_settings_(.+)/, async (ctx) => {
    await ctx.answerCbQuery('⏰ Настройки расписания будут доступны в следующем обновлении');
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

  // Тарифы
  bot.hears('💎 Тарифы', async (ctx) => {
    let message = `💎 Доступные тарифы:\n\n`;

    Object.entries(SUBSCRIPTION_PLANS).forEach(([key, plan]) => {
      if (key !== 'FREE' || ctx.user.subscription.isTrial) {
        message += `🔸 *${plan.name}*\n`;
        message += `Каналов: ${plan.channels}\n`;
        message += `Постов в день: ${plan.postsPerDay}\n`;
        message += `AI-генерация: ${plan.aiAccess ? '✅' : '❌'}\n`;
        message += `Цена: ${plan.price > 0 ? `${plan.price} звезд` : 'Бесплатно'}\n\n`;
      }
    });

    if (ctx.user.subscription.isTrial) {
      message += `🎁 У вас активен пробный период до ${new Date(ctx.user.subscription.trialEndDate).toLocaleDateString('ru-RU')}`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
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
}

module.exports = setupUserHandlers;