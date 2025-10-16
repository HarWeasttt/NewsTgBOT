const User = require('../../models/User');
const Channel = require('../../models/Channel');
const Transaction = require('../../models/Transaction');
const LogService = require('../../services/LogService');
const UserService = require('../../services/UserService');
const AIService = require('../../services/AIService');
const ConfigService = require('../../services/ConfigService');
const BotManager = require('../../services/BotManager');
const { rssSetupScene, quickRssSetupScene } = require('../scenes/rssSetupScene');
const { userMainKeyboard, channelDetailKeyboard,
  deleteConfirmKeyboard,
  rssManagementKeyboard,
  rssDeleteSelectionKeyboard } = require('../keyboards/keyboards');
const { BOT_CONFIG, SUBSCRIPTION_PLANS, loadCustomPlans } = require('../../config');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');

function setupCallbackHandlers(bot) {

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

  // Статистика тарифов - ОБНОВЛЕННАЯ ВЕРСИЯ
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

  // Сброс тарифов - ОБНОВЛЕННАЯ ВЕРСИЯ
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
                      { $ne: ['$_id', 'FREE'] },
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

      stats.forEach(stat => {
        const plan = SUBSCRIPTION_PLANS[stat._id];
        if (plan) {
          message += `🔸 *${plan.name}*\n`;
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

      message += `📈 Общая статистика:\n`;
      message += `   Всего пользователей: ${totalUsers}\n`;
      message += `   Активных подписок: ${activeSubs}\n`;
      message += `   Конверсия: ${((activeSubs / totalUsers) * 100).toFixed(1)}%`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Назад к тарифам', callback_data: 'admin_back_to_plans' }]
          ]
        }
      });

    } catch (error) {
      console.error('Plan stats error:', error);
      await ctx.editMessageText('❌ Ошибка при получении статистики');
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

  // Изменение API ключа AI - ПОЛНАЯ РЕАЛИЗАЦИЯ
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

  // Перезапуск бота - ПОЛНАЯ РЕАЛИЗАЦИЯ
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

  // Показать больше строк лога - ИСПРАВЛЕННАЯ ВЕРСИЯ
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

      message += `\`\`\`\n`;
      logContent.lines.forEach(line => {
        message += `${LogService.formatLogLine(line)}\n`;
      });
      message += `\`\`\`\n`;

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

  // Изменение тарифа пользователя - ИСПРАВЛЕННАЯ ВЕРСИЯ
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
      `🚀 Автопостинг: ${channel.settings.autoPublish ? '✅' : '❌'}\n` +
      `📈 Постов всего: ${channel.statistics?.totalPosts || 0}\n\n` +
      `Выберите действие:`;

    await ctx.editMessageText(message, {
      reply_markup: channelDetailKeyboard(channelId)
    });
  });

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