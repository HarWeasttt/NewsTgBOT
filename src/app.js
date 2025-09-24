const { Telegraf, session, Scenes: { Stage } } = require('telegraf');
const express = require('express');
const config = require('../config');
const { connectDB } = require('../config/database');
const logger = require('./utils/logger');

// Middleware
const userAuth = require('./bot/middleware/auth');
const subscriptionCheck = require('./bot/middleware/subscriptionCheck');
const adminCheck = require('./bot/middleware/adminCheck');

// Controllers
const userController = require('./controllers/userController');
const channelController = require('./controllers/channelController');
const promptController = require('./controllers/promptController');
const adminController = require('./controllers/adminController');

// Scenes
const stage = require('./bot/scenes');

// Services
const SchedulerService = require('./services/schedulerService');

class Application {
  constructor() {
    this.bot = new Telegraf(config.bot.token);
    this.app = express();
    this.scheduler = new SchedulerService(this.bot);
    
    this.setupExpress();
    this.setupBot();
  }

  setupExpress() {
    this.app.use(express.json());
    this.app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });

    // Webhook для платежей (будет добавлен позже)
    this.app.post('/webhook/payment', (req, res) => {
      // Обработка webhook от платежной системы
      res.status(200).send('OK');
    });
  }

  setupBot() {
    // Middleware
    this.bot.use(session());
    this.bot.use(stage.middleware());
    this.bot.use(userAuth);
    this.bot.use(subscriptionCheck);

    // Команды
    this.bot.start(userController.start);
    this.bot.help(userController.help);

    // Главное меню
    this.bot.hears('📊 Мой кабинет', userController.showCabinet);
    this.bot.hears('ℹ️ Помощь', userController.help);
    this.bot.hears('💳 Тарифы', (ctx) => ctx.reply('Раздел в разработке'));
    this.bot.hears('👨‍💻 Поддержка', (ctx) => ctx.reply('По вопросам поддержки: @username'));

    // Мой кабинет
    this.bot.hears('📺 Мои каналы', userController.showChannels);
    this.bot.hears('🔍 Мои промты', userController.showPrompts);
    this.bot.hears('⏰ Расписание', (ctx) => ctx.reply('Раздел в разработке'));
    this.bot.hears('💎 Мой тариф', userController.showSubscriptionStatus);

    // Управление каналами
    this.bot.hears('➕ Добавить канал', channelController.startAddChannel);
    this.bot.hears('📋 Список каналов', userController.showChannels);
    this.bot.hears('🗑️ Удалить канал', (ctx) => ctx.reply('Используйте кнопки управления в списке каналов'));

    // Управление промтами
    this.bot.hears('➕ Добавить промт', promptController.startAddPrompt);
    this.bot.hears('📋 Список промтов', userController.showPrompts);
    this.bot.hears('🗑️ Удалить промт', (ctx) => ctx.reply('Используйте кнопки управления в списке промтов'));

    // Навигация
    this.bot.hears('🔙 Главное меню', userController.start);
    this.bot.hears('🔙 Мой кабинет', userController.showCabinet);
    this.bot.hears('❌ Отмена', (ctx) => {
      channelController.cancelAction(ctx);
      promptController.cancelAction(ctx);
    });

    // Обработка ввода для добавления канала
    this.bot.on('message', async (ctx) => {
      if (ctx.session.waitingForChannel) {
        return channelController.handleChannelInput(ctx);
      }
      
      if (ctx.session.waitingForPromptName) {
        return promptController.handlePromptName(ctx);
      }
      
      if (ctx.session.waitingForPromptQuery) {
        return promptController.handlePromptQuery(ctx);
      }
      
      if (ctx.session.waitingForPromptLanguage) {
        return promptController.handlePromptLanguage(ctx);
      }
      
      if (ctx.session.waitingForPromptExclude) {
        return promptController.handlePromptExclude(ctx);
      }

      if (ctx.session.waitingForBroadcast) {
        return adminController.handleBroadcastMessage(ctx);
      }
    });

    // Админ команды
    this.bot.command('admin', adminCheck, adminController.showPanel);
    this.bot.command('setplan', adminCheck, adminController.setUserPlan);
    this.bot.hears('📈 Статистика', adminCheck, adminController.showStats);
    this.bot.hears('👥 Пользователи', adminCheck, adminController.showUsers);
    this.bot.hears('⚙️ Тарифы', adminCheck, adminController.manageSubscriptionPlans);
    this.bot.hears('📢 Рассылка', adminCheck, adminController.broadcastMessage);

    // Обработка ошибок
    this.bot.catch((error, ctx) => {
      logger.error('Bot error:', error);
      ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте позже.');
    });
  }

  async start() {
    try {
      // Подключение к БД
      await connectDB();
      logger.info('✅ Database connected');

      // Инициализация планировщика
      this.scheduler.init();
      logger.info('✅ Scheduler initialized');

      // Запуск бота
      if (config.server.nodeEnv === 'production' && config.bot.webhookUrl) {
        // Webhook для продакшена
        await this.bot.launch({
          webhook: {
            domain: config.bot.webhookUrl,
            port: config.server.port
          }
        });
        logger.info(`✅ Bot started with webhook on port ${config.server.port}`);
      } else {
        // Long polling для разработки
        await this.bot.launch();
        logger.info('✅ Bot started with long polling');
      }

      // Запуск Express сервера
      this.app.listen(config.server.port, () => {
        logger.info(`✅ Express server started on port ${config.server.port}`);
      });

      // Graceful shutdown
      process.once('SIGINT', () => this.shutdown());
      process.once('SIGTERM', () => this.shutdown());

    } catch (error) {
      logger.error('Application startup error:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('🛑 Shutting down application...');
    this.bot.stop();
    process.exit(0);
  }
}

// Запуск приложения
const app = new Application();
app.start();

module.exports = app;