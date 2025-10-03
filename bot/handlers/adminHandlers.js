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
                  { $and: [
                    { $ne: ['$subscription.plan', 'FREE'] },
                    { $gt: ['$subscription.endDate', new Date()] }
                  ]},
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