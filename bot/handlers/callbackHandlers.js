const User = require('../../models/User');
const Channel = require('../../models/Channel');
const Transaction = require('../../models/Transaction');
const UserService = require('../../services/UserService');
const AIService = require('../../services/AIService');
const { userMainKeyboard, adminMainKeyboard } = require('../keyboards/keyboards');
const { BOT_CONFIG, SUBSCRIPTION_PLANS } = require('../../config');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

function setupCallbackHandlers(bot) {
  // ДЕБАГ обработчик - покажет все callback_data
  bot.on('callback_query', (ctx) => {
    console.log('🔍 Callback received:', ctx.callbackQuery.data);
  });

  // ==================== АДМИНСКИЕ ОБРАБОТЧИКИ ====================

  // Возврат в админ-панель
  bot.action('admin_back_to_panel', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await ctx.editMessageText('🛠 Панель администратора', {
      reply_markup: adminMainKeyboard
    });
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

    await ctx.editMessageText('🛠 Панель администратора', {
      reply_markup: adminMainKeyboard
    });
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
  bot.action('admin_edit_plans', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await ctx.editMessageText('⚙️ Изменение тарифов временно недоступно\n\nЭта функция будет добавлена в следующем обновлении.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад', callback_data: 'admin_back_to_panel' }]
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

    await ctx.editMessageText('🔧 Изменение API ключа OpenAI\n\nЭта функция будет доступна в настройках системы в следующем обновлении.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад', callback_data: 'admin_back_to_panel' }]
        ]
      }
    });
  });

  // Перезапуск бота
  bot.action('admin_restart_bot', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await ctx.editMessageText('🔄 Перезапуск бота\n\nЭта функция будет доступна в следующем обновлении.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад', callback_data: 'admin_back_to_panel' }]
        ]
      }
    });
  });

  // Логи системы
  bot.action('admin_system_logs', async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    await ctx.editMessageText('📋 Логи системы\n\nПросмотр логов будет доступен в следующем обновлении.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Назад', callback_data: 'admin_back_to_panel' }]
        ]
      }
    });
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

    const userId = ctx.match[1];
    
    try {
      const user = await User.findById(userId);
      if (!user) {
        await ctx.answerCbQuery('❌ Пользователь не найден');
        return;
      }

      await ctx.editMessageText(`💎 Изменение тарифа для ${user.firstName}\n\nТекущий тариф: ${user.subscription.plan}\n\nВыберите новый тариф:`, {
        reply_markup: {
          inline_keyboard: [
            Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => 
              [{ text: plan.name, callback_data: `admin_set_plan_${userId}_${key}` }]
            ),
            [{ text: '🔙 Назад', callback_data: 'admin_back' }]
          ].flat()
        }
      });
    } catch (error) {
      console.error('Change plan error:', error);
      await ctx.answerCbQuery('❌ Ошибка при изменении тарифа');
    }
  });

  // Установка тарифа пользователю
  bot.action(/admin_set_plan_(.+)_(.+)/, async (ctx) => {
    if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
      await ctx.answerCbQuery('❌ Доступ запрещен');
      return;
    }

    const userId = ctx.match[1];
    const planKey = ctx.match[2];
    
    try {
      const user = await UserService.updateSubscription(userId, planKey);
      if (!user) {
        await ctx.answerCbQuery('❌ Ошибка при изменении тарифа');
        return;
      }

      await ctx.answerCbQuery(`✅ Тариф изменен на ${planKey}`);
      await ctx.editMessageText(`✅ Тариф пользователя ${user.firstName} изменен на ${SUBSCRIPTION_PLANS[planKey].name}!`);
    } catch (error) {
      console.error('Set plan error:', error);
      await ctx.answerCbQuery('❌ Ошибка при изменении тарифа');
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

  // Управление каналами
  bot.action('manage_channels', async (ctx) => {
    const channels = await Channel.find({ owner: ctx.user._id });
    
    if (channels.length === 0) {
      await ctx.editMessageText('❌ У вас нет подключенных каналов.');
      return;
    }
    
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

  // Запуск сцены добавления RSS
  bot.action(/rss_setup_(.+)/, async (ctx) => {
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
    channel.aiSettings.tone = tone;
    await channel.save();
    
    await ctx.answerCbQuery(`✅ Стиль изменен на: ${tone}`);
    await ctx.editMessageText(`✅ Стиль AI для канала "${channel.title}" изменен на: ${tone}`);
  });

  // Запуск сцены генерации AI поста
  bot.action(/ai_generate_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    
    try {
      const user = await UserService.getOrCreateUser(ctx.from);
      
      if (!user.subscription.isTrial && !user.subscription.aiAccess) {
        await ctx.answerCbQuery('❌ AI-генерация доступна только на платных тарифах');
        return;
      }
      
      const canPost = await UserService.canUserPost(user);
      if (!canPost) {
        await ctx.answerCbQuery('❌ Вы достигли дневного лимита постов');
        return;
      }
      
      await ctx.answerCbQuery();
      await ctx.scene.enter('ai-post-scene', { 
        channelId: channelId,
        user: user
      });
    } catch (error) {
      console.error('Error entering AI scene:', error);
      await ctx.answerCbQuery('❌ Ошибка при запуске генерации');
    }
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

  // Удаление RSS (заглушка)
  bot.action(/delete_rss_(.+)/, async (ctx) => {
    await ctx.answerCbQuery('🗑️ Удаление RSS будет доступно в следующем обновлении');
  });

  // ==================== ОБРАБОТКА ТЕКСТОВОГО ПОИСКА ПОЛЬЗОВАТЕЛЕЙ ====================

  bot.on('text', async (ctx) => {
    if (ctx.session && ctx.session.waitingForUserSearch) {
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
    }
  });
}

module.exports = setupCallbackHandlers;