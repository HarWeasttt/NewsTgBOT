const { Telegraf, session, Scenes: { Stage, WizardScene } } = require('telegraf');
const express = require('express');
const config = require('../config');
const { connectDB } = require('../config/database');
const logger = require('./utils/logger');

// Middleware
const userAuth = require('./bot/middleware/auth');

// Models
const { Channel, Prompt, User, SubscriptionPlan, Payment } = require('./models');

// Utils
const Keyboards = require('./utils/keyboards');
const Helpers = require('./utils/helpers');

// ==================== СЦЕНЫ ====================

// Сцена добавления канала
const addChannelScene = new WizardScene(
  'ADD_CHANNEL_SCENE',
  
  // Шаг 1: Запрос канала
  async (ctx) => {
    await ctx.reply(
      '📺 **Добавление канала**\n\n' +
      'Перешлите любое сообщение из канала или введите @username:',
      Keyboards.cancelAction()
    );
    return ctx.wizard.next();
  },

  // Шаг 2: Обработка канала
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
        await ctx.reply('Пожалуйста, перешлите сообщение из канала или введите @username');
        return;
      }

      if (channelInfo.type !== 'channel') {
        await ctx.reply('❌ Это не канал. Пожалуйста, укажите Telegram канал.');
        return;
      }

      // Проверка прав бота
      try {
        const member = await ctx.telegram.getChatMember(channelInfo.id, ctx.botInfo.id);
        if (!(member.status === 'administrator' && member.can_post_messages)) {
          await ctx.reply('❌ Бот не имеет прав на отправку сообщений в этот канал.');
          return;
        }
      } catch (error) {
        await ctx.reply('❌ Бот не добавлен в канал или нет прав.');
        return;
      }

      // Проверка существования канала
      const existingChannel = await Channel.findOne({ 
        telegramId: channelInfo.id,
        owner: ctx.session.user._id
      });
      
      if (existingChannel) {
        await ctx.reply('❌ Этот канал уже добавлен в систему.');
        return ctx.scene.leave();
      }

      ctx.wizard.state.channelData = {
        telegramId: channelInfo.id,
        title: channelInfo.title,
        username: channelInfo.username
      };

      await ctx.reply(
        `✅ Канал "${channelInfo.title}" найден!\n\n` +
        'Введите шаблон для постов или используйте стандартный:\n\n' +
        'Стандартный шаблон: {title}\\n\\n{summary}\\n\\n{source_link}',
        Keyboards.cancelAction()
      );

      return ctx.wizard.next();

    } catch (error) {
      console.error('Channel scene error:', error);
      await ctx.reply('❌ Ошибка при добавлении канала. Попробуйте еще раз.');
      return ctx.scene.leave();
    }
  },

  // Шаг 3: Шаблон поста
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.backToCabinet());
      return ctx.scene.leave();
    }

    const template = ctx.message.text || '{title}\n\n{summary}\n\n{source_link}';

    try {
      const channel = new Channel({
        ...ctx.wizard.state.channelData,
        postTemplate: template,
        owner: ctx.session.user._id
      });

      await channel.save();

      await ctx.reply(
        `✅ Канал "${channel.title}" успешно добавлен!`,
        Keyboards.channelsManagement()
      );

    } catch (error) {
      console.error('Channel save error:', error);
      await ctx.reply('❌ Ошибка при сохранении канала.');
    }

    return ctx.scene.leave();
  }
);

// Сцена добавления промта
const addPromptScene = new WizardScene(
  'ADD_PROMPT_SCENE',
  
  // Шаг 1: Название промта
  async (ctx) => {
    await ctx.reply(
      '🔍 **Создание нового промта**\n\n' +
      'Введите название для вашего промта:',
      Keyboards.cancelAction()
    );
    return ctx.wizard.next();
  },

  // Шаг 2: Поисковый запрос
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
      return ctx.scene.leave();
    }

    const name = ctx.message.text.trim();
    
    if (name.length < 2) {
      await ctx.reply('❌ Название слишком короткое.');
      return;
    }

    ctx.wizard.state.promptData = { name };
    
    await ctx.reply(
      'Теперь введите поисковый запрос для новостей:',
      Keyboards.cancelAction()
    );

    return ctx.wizard.next();
  },

  // Шаг 3: Сохранение
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
      return ctx.scene.leave();
    }

    const query = ctx.message.text.trim();
    
    if (query.length < 3) {
      await ctx.reply('❌ Запрос слишком короткий.');
      return;
    }

    const { name } = ctx.wizard.state.promptData;

    try {
      const prompt = new Prompt({
        name: name,
        query: query,
        language: 'ru',
        keywordsToExclude: [],
        owner: ctx.session.user._id
      });

      await prompt.save();

      await ctx.reply(
        `✅ Промт "${name}" успешно создан!\n\n` +
        `Запрос: "${query}"`,
        Keyboards.promptsManagement()
      );

    } catch (error) {
      console.error('Prompt creation error:', error);
      await ctx.reply('❌ Ошибка при создании промта.');
    }

    return ctx.scene.leave();
  }
);

// ==================== КОНТРОЛЛЕРЫ ====================

class UserController {
  async start(ctx) {
    const message = `🤖 **Добро пожаловать в NewsBot!**\n\n` +
      `Я помогу автоматизировать публикацию новостей в ваши Telegram каналы.\n\n` +
      `🆓 **Вам доступен пробный период на 7 дней!**\n\n` +
      `Нажмите "📊 Мой кабинет" чтобы начать.`;

    await ctx.replyWithMarkdown(message, Keyboards.mainMenu());
  }

  async help(ctx) {
    const message = `📖 **Справка по использованию бота**\n\n` +
      `**Основные функции:**\n` +
      `• 📊 Мой кабинет - управление настройками\n` +
      `• 📺 Мои каналы - добавление и управление каналами\n` +
      `• 🔍 Мои промты - создание поисковых запросов\n` +
      `• ⏰ Расписание - настройка времени публикаций\n\n` +
      `**Для начала работы:**\n` +
      `1. Добавьте канал через "Мои каналы"\n` +
      `2. Создайте промт через "Мои промты"\n` +
      `3. Настройте расписание`;

    await ctx.replyWithMarkdown(message, Keyboards.mainMenu());
  }

  async showCabinet(ctx) {
    const user = ctx.session.user;
    const channelsCount = await Channel.countDocuments({ owner: user._id });
    const promptsCount = await Prompt.countDocuments({ owner: user._id });

    const message = `👤 **Ваш кабинет**\n\n` +
      `💎 **Тариф:** ${user.subscription.type}\n` +
      `📅 **Действует до:** ${Helpers.formatSubscriptionDate(user.subscription.expiresAt)}\n` +
      `✅ **Статус:** ${user.hasActiveSubscription() ? 'Активен' : 'Не активен'}\n\n` +
      `📊 **Использование:**\n` +
      `📺 Каналы: ${channelsCount}\n` +
      `🔍 Промты: ${promptsCount}\n\n` +
      `Выберите раздел для управления:`;

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
      message += `${index + 1}. ${channel.title}\n`;
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
      message += `   Запрос: "${prompt.query}"\n\n`;
    });

    await ctx.replyWithMarkdown(message, Keyboards.promptsManagement());
  }
}

class ChannelController {
  async startAddChannel(ctx) {
    return ctx.scene.enter('ADD_CHANNEL_SCENE');
  }
}

class PromptController {
  async startAddPrompt(ctx) {
    return ctx.scene.enter('ADD_PROMPT_SCENE');
  }
}

class AdminController {
  async showPanel(ctx) {
    if (!this.isAdmin(ctx)) {
      return ctx.reply('❌ У вас нет прав доступа.');
    }

    await ctx.reply(
      '👑 **Панель администратора**\n\nВыберите действие:',
      Keyboards.adminMenu()
    );
  }

  async showStats(ctx) {
    if (!this.isAdmin(ctx)) return;

    const [
      totalUsers,
      activeUsers,
      totalChannels,
      totalPrompts,
      totalPayments,
      revenue
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ 'subscription.expiresAt': { $gt: new Date() } }),
      Channel.countDocuments(),
      Prompt.countDocuments(),
      Payment.countDocuments({ status: 'succeeded' }),
      Payment.aggregate([
        { $match: { status: 'succeeded' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    const revenueTotal = revenue[0]?.total || 0;

    const message = `📊 **Статистика системы**\n\n` +
      `👥 **Пользователи:**\n` +
      `• Всего: ${totalUsers}\n` +
      `• Активных: ${activeUsers}\n\n` +
      `📺 **Контент:**\n` +
      `• Каналов: ${totalChannels}\n` +
      `• Промтов: ${totalPrompts}\n\n` +
      `💰 **Финансы:**\n` +
      `• Платежей: ${totalPayments}\n` +
      `• Доход: ${revenueTotal} руб.`;

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

  async broadcastMessage(ctx) {
    if (!this.isAdmin(ctx)) return;

    await ctx.reply(
      '📢 **Массовая рассылка**\n\nВведите сообщение для отправки:',
      Keyboards.cancelAction()
    );
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
        await new Promise(resolve => setTimeout(resolve, 100)); // Задержка
      } catch (error) {
        errors++;
      }
    }

    delete ctx.session.waitingForBroadcast;

    await ctx.reply(
      `✅ Рассылка завершена!\nУспешно: ${success}\nОшибок: ${errors}`,
      Keyboards.adminMenu()
    );
  }

  async setUserPlan(ctx) {
    if (!this.isAdmin(ctx)) return;

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
      return ctx.reply('Использование: /setplan [user_id] [plan_code]');
    }

    const [userId, planCode] = args;

    try {
      const user = await User.findOne({ telegramId: parseInt(userId) });
      if (!user) return ctx.reply('❌ Пользователь не найден');

      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      user.subscription.type = planCode;
      user.subscription.expiresAt = expiry;
      await user.save();

      await ctx.reply(`✅ Пользователю ${user.firstName} установлен тариф "${planCode}"`);
      
      // Уведомляем пользователя
      await ctx.telegram.sendMessage(
        user.telegramId,
        `🎉 Ваш тариф изменен на "${planCode}"`
      );

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
    
    // Создаем Stage и регистрируем сцены
    this.stage = new Stage([addChannelScene, addPromptScene]);
    
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
    // Middleware
    this.bot.use(session());
    this.bot.use(this.stage.middleware());
    this.bot.use(userAuth);

    // Команды
    this.bot.start((ctx) => this.userController.start(ctx));
    this.bot.help((ctx) => this.userController.help(ctx));

    // Главное меню
    this.bot.hears('📊 Мой кабинет', (ctx) => this.userController.showCabinet(ctx));
    this.bot.hears('ℹ️ Помощь', (ctx) => this.userController.help(ctx));

    // Мой кабинет
    this.bot.hears('📺 Мои каналы', (ctx) => this.userController.showChannels(ctx));
    this.bot.hears('🔍 Мои промты', (ctx) => this.userController.showPrompts(ctx));
    this.bot.hears('💎 Мой тариф', (ctx) => this.userController.showCabinet(ctx));

    // Управление
    this.bot.hears('➕ Добавить канал', (ctx) => this.channelController.startAddChannel(ctx));
    this.bot.hears('➕ Добавить промт', (ctx) => this.promptController.startAddPrompt(ctx));

    // АДМИНСКИЕ КОМАНДЫ
    this.bot.command('admin', (ctx) => this.adminController.showPanel(ctx));
    this.bot.command('setplan', (ctx) => this.adminController.setUserPlan(ctx));
    
    this.bot.hears('📈 Статистика', (ctx) => this.adminController.showStats(ctx));
    this.bot.hears('👥 Пользователи', (ctx) => this.adminController.showUsers(ctx));
    this.bot.hears('📢 Рассылка', (ctx) => this.adminController.broadcastMessage(ctx));
    this.bot.hears('⚙️ Тарифы', (ctx) => ctx.reply('Раздел в разработке', Keyboards.adminMenu()));

    // Навигация
    this.bot.hears('🔙 Главное меню', (ctx) => this.userController.start(ctx));
    this.bot.hears('🔙 Мой кабинет', (ctx) => this.userController.showCabinet(ctx));
    this.bot.hears('🔙 Админ-панель', (ctx) => this.adminController.showPanel(ctx));
    this.bot.hears('❌ Отмена', (ctx) => {
      if (ctx.session.waitingForBroadcast) {
        delete ctx.session.waitingForBroadcast;
      }
      if (ctx.scene) {
        return ctx.scene.leave();
      }
      ctx.reply('Действие отменено.', Keyboards.mainMenu());
    });

    // Обработка ввода для рассылки
    this.bot.on('message', (ctx) => {
      if (ctx.session.waitingForBroadcast) {
        return this.adminController.handleBroadcastMessage(ctx);
      }
    });

    // Обработка ошибок
    this.bot.catch((error, ctx) => {
      console.error('Bot error:', error);
      ctx.reply('❌ Произошла ошибка.');
    });
  }

  async start() {
    try {
      // Подключение к БД
      await connectDB();
      console.log('✅ Database connected');

      // Запуск бота
      await this.bot.launch();
      console.log('✅ Bot started');

      // Запуск Express
      this.app.listen(config.server.port, () => {
        console.log(`✅ Express on port ${config.server.port}`);
      });

      console.log('🚀 Application started successfully!');
      console.log('👑 Admin commands: /admin, /setplan');
      console.log('🎯 User commands: /start, /help');

      // Graceful shutdown
      process.once('SIGINT', () => this.shutdown());
      process.once('SIGTERM', () => this.shutdown());

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