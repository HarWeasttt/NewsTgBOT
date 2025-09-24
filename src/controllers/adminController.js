const { User, Channel, Prompt, Schedule, Payment, SubscriptionPlan } = require('../models');
const CONSTANTS = require('../utils/constants');
const Keyboards = require('../utils/keyboards');

class AdminController {
  async showPanel(ctx) {
    await ctx.replyWithMarkdown(
      CONSTANTS.MESSAGES.ADMIN_WELCOME,
      Keyboards.adminMenu()
    );
  }

  async showStats(ctx) {
    const [
      totalUsers,
      activeUsers,
      totalChannels,
      totalPrompts,
      activeSchedules,
      totalPayments,
      revenue
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ 'subscription.expiresAt': { $gt: new Date() } }),
      Channel.countDocuments(),
      Prompt.countDocuments(),
      Schedule.countDocuments({ isActive: true }),
      Payment.countDocuments({ status: 'succeeded' }),
      Payment.aggregate([
        { $match: { status: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const revenueTotal = revenue[0]?.total || 0;

    const statsMessage = `📊 **Статистика системы**

👥 **Пользователи:**
• Всего: ${totalUsers}
• Активных подписок: ${activeUsers}

📺 **Каналы и промты:**
• Каналов: ${totalChannels}
• Промтов: ${totalPrompts}
• Активных расписаний: ${activeSchedules}

💰 **Финансы:**
• Успешных платежей: ${totalPayments}
• Общий доход: ${revenueTotal} руб.

🔄 **Последняя активность:** ${new Date().toLocaleString('ru-RU')}`;

    await ctx.replyWithMarkdown(statsMessage, Keyboards.adminMenu());
  }

  async showUsers(ctx) {
    const users = await User.find()
      .sort({ createdAt: -1 })
      .limit(50);

    let message = '👥 **Последние 50 пользователей**\n\n';

    users.forEach((user, index) => {
      const daysSinceJoin = Math.floor((new Date() - user.createdAt) / (1000 * 60 * 60 * 24));
      message += `${index + 1}. ${user.firstName} (@${user.username || 'нет'})\n`;
      message += `   ID: ${user.telegramId} | Регистрация: ${daysSinceJoin} дн. назад\n`;
      message += `   Тариф: ${user.subscription.type} | Активен: ${user.hasActiveSubscription() ? '✅' : '❌'}\n\n`;
    });

    // Разбиваем сообщение если слишком длинное
    if (message.length > 4000) {
      message = message.substring(0, 4000) + '\n\n... (показаны первые 50 пользователей)';
    }

    await ctx.replyWithMarkdown(message, Keyboards.adminMenu());
  }

  async manageSubscriptionPlans(ctx) {
    const plans = await SubscriptionPlan.find({ isActive: true });

    let message = '⚙️ **Управление тарифными планами**\n\n';

    plans.forEach((plan, index) => {
      message += `${index + 1}. **${plan.name}**\n`;
      message += `   Код: ${plan.code} | Цена: ${plan.price} руб.\n`;
      message += `   Лимиты: ${plan.channelsLimit} каналов, ${plan.promptsLimit} промтов\n`;
      message += `   ID: ${plan._id}\n\n`;
    });

    message += 'Для изменения тарифа пользователю используйте команду:\n' +
               '/setplan [user_id] [plan_code]\n\n' +
               'Пример: /setplan 123456789 advanced';

    await ctx.replyWithMarkdown(message, Keyboards.adminMenu());
  }

  async setUserPlan(ctx) {
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length < 2) {
      await ctx.reply('Использование: /setplan [user_id] [plan_code]');
      return;
    }

    const [userId, planCode] = args;

    try {
      const user = await User.findOne({ telegramId: parseInt(userId) });
      const plan = await SubscriptionPlan.findOne({ code: planCode });

      if (!user) {
        await ctx.reply('❌ Пользователь не найден');
        return;
      }

      if (!plan) {
        await ctx.reply('❌ Тарифный план не найден');
        return;
      }

      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1);

      user.subscription.type = planCode;
      user.subscription.expiresAt = expiryDate;
      await user.save();

      await ctx.reply(
        `✅ Пользователю ${user.firstName} установлен тариф "${plan.name}"`
      );

      // Уведомляем пользователя
      await ctx.telegram.sendMessage(
        user.telegramId,
        `🎉 Администратор изменил ваш тариф на "${plan.name}"\n\n` +
        `Тариф действует до: ${expiryDate.toLocaleDateString('ru-RU')}`
      );

    } catch (error) {
      console.error('Set plan error:', error);
      await ctx.reply('❌ Ошибка при изменении тарифа');
    }
  }

  async broadcastMessage(ctx) {
    await ctx.reply(
      '📢 **Массовая рассылка**\n\n' +
      'Введите сообщение для рассылки всем пользователям:',
      Keyboards.cancelAction()
    );

    ctx.session.waitingForBroadcast = true;
  }

  async handleBroadcastMessage(ctx) {
    if (!ctx.session.waitingForBroadcast) return;

    const message = ctx.message.text;
    const users = await User.find({});

    let successCount = 0;
    let errorCount = 0;

    await ctx.reply(`Начинаю рассылку для ${users.length} пользователей...`);

    for (const user of users) {
      try {
        await ctx.telegram.sendMessage(user.telegramId, message);
        successCount++;
        
        // Задержка чтобы не превысить лимиты Telegram
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        errorCount++;
        console.error(`Broadcast error for user ${user.telegramId}:`, error);
      }
    }

    delete ctx.session.waitingForBroadcast;

    await ctx.reply(
      `✅ Рассылка завершена!\n\n` +
      `✅ Успешно: ${successCount}\n` +
      `❌ Ошибок: ${errorCount}`,
      Keyboards.adminMenu()
    );
  }
}

module.exports = new AdminController();