require('dotenv').config();
const { Telegraf, session, Scenes } = require('telegraf');
const mongoose = require('mongoose');
const cron = require('node-cron');
const fs = require('fs');

const { BOT_CONFIG } = require('./config');

// Создаем папку temp если не существует
if (!fs.existsSync('./temp')) {
  fs.mkdirSync('./temp', { recursive: true });
}

/**
 * Главный класс приложения - управляет всем ботом
 * Отвечает за инициализацию, подключение к БД и запуск бота
 */
class Application {
  constructor() {
    // Создаем экземпляр бота с токеном из конфигурации
    this.bot = new Telegraf(BOT_CONFIG.TOKEN);

    // Инициализируем все компоненты приложения
    this.setupDatabase();    // Подключение к MongoDB
    this.setupBot();         // Настройка бота и обработчиков
    this.setupCronJobs();    // Запуск фоновых задач
    this.startAutoPosting();
  }

  /**
   * Подключение к базе данных MongoDB
   * Вызывается при старте приложения
   */
  async setupDatabase() {
    try {
      // Устанавливаем соединение с MongoDB
      await mongoose.connect(BOT_CONFIG.MONGODB_URI);
      console.log('✅ MongoDB подключена');

      // Запускаем миграцию после подключения к БД
      await this.migrateExistingChannels();
    } catch (error) {
      console.error('❌ Ошибка подключения к MongoDB:', error);
      process.exit(1); // Завершаем процесс при ошибке подключения к БД
    }
  }

  /**
   * Миграция существующих каналов - добавляем поле schedule если его нет
   */
  async migrateExistingChannels() {
    try {
      const Channel = require('./models/Channel');
      const channels = await Channel.find({});
      let updatedCount = 0;

      for (const channel of channels) {
        let needsUpdate = false;

        // Проверяем и инициализируем schedule
        if (!channel.schedule || typeof channel.schedule.enabled === 'undefined') {
          channel.schedule = {
            enabled: false,
            times: []
          };
          needsUpdate = true;
        }

        // Проверяем и инициализируем другие поля если нужно
        if (!channel.settings) {
          channel.settings = {
            mode: 'combined',
            autoPublish: true
          };
          needsUpdate = true;
        }

        if (!channel.aiSettings) {
          channel.aiSettings = {
            tone: 'professional',
            topics: []
          };
          needsUpdate = true;
        }

        if (needsUpdate) {
          await channel.save();
          updatedCount++;
          console.log(`✅ Updated channel: ${channel.title}`);
        }
      }

      if (updatedCount > 0) {
        console.log(`🎉 Migration completed: ${updatedCount} channels updated`);
      } else {
        console.log('✅ All channels are already up to date');
      }
    } catch (error) {
      console.error('❌ Migration error:', error);
    }
  }

  /**
   * Запуск сервиса автопостинга
   */
  startAutoPosting() {
    const AutoPostService = require('./services/AutoPostService');
    const RssService = require('./services/RSSService');
    
    // ПЕРЕДАЕМ БОТ В СЕРВИСЫ ПЕРЕД ЗАПУСКОМ
    console.log('🔧 Setting bot instances in services...');
    
    // Передаем бот в AutoPostService
    if (AutoPostService.setBot) {
      AutoPostService.setBot(this.bot);
      console.log('✅ Bot set in AutoPostService');
    } else {
      console.log('❌ AutoPostService.setBot method not found');
    }
    
    // Передаем бот в RSSService
    if (RssService.setBot) {
      RssService.setBot(this.bot);
      console.log('✅ Bot set in RSSService');
    } else {
      console.log('❌ RSSService.setBot method not found');
    }
    
    // Запускаем автопостинг
    AutoPostService.start();
    console.log('🚀 AutoPostService started');
  }

  /**
   * Основная настройка бота - регистрация middleware и обработчиков
   * Порядок важен: сначала middleware, потом обработчики
   */
  setupBot() {
    console.log('🔧 Настройка бота...');

    // Загружаем сцены для многошаговых взаимодействий (wizard scenes)
    const rssSetupScene = require('./bot/scenes/rssSetupScene'); // Настройка RSS
    const aiPostScene = require('./bot/scenes/aiPostScene');     // Генерация AI постов
    const editPlanScene = require('./bot/scenes/editPlanScene');
    const changeAIKeyScene = require('./bot/scenes/changeAIKeyScene');
    const createPlanScene = require('./bot/scenes/createPlanScene');

    // Создаем stage для управления сценами
    const stage = new Scenes.Stage([rssSetupScene, aiPostScene, editPlanScene, changeAIKeyScene, createPlanScene]);

    // ========== MIDDLEWARE СТЕК ==========
    // Middleware выполняются ПОСЛЕДОВАТЕЛЬНО для каждого входящего сообщения

    // 1. Сессии - хранение состояния между сообщениями
    this.bot.use(session());

    // 2. Сцены - управление многошаговыми диалогами
    this.bot.use(stage.middleware());

    // 3. Логирование всех входящих сообщений
    this.bot.use(async (ctx, next) => {
      const now = new Date().toLocaleString('ru-RU');

      // Логируем текстовые сообщения
      if (ctx.message && ctx.message.text) {
        console.log(`📨 [${now}] ${ctx.from.first_name} (@${ctx.from.username || 'no_username'}): ${ctx.message.text}`);
      }

      // Логируем нажатия inline кнопок
      if (ctx.callbackQuery) {
        console.log(`🔘 [${now}] ${ctx.from.first_name} нажал: ${ctx.callbackQuery.data}`);
      }

      await next(); // Передаем управление следующему middleware
    });

    // 4. Добавление пользователя в контекст
    this.bot.use(async (ctx, next) => {
      if (ctx.from) {
        try {
          const UserService = require('./services/UserService');

          // Получаем или создаем пользователя в БД
          ctx.user = await UserService.getOrCreateUser(ctx.from);

          // Проверяем права администратора
          ctx.isAdmin = BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id);

          // Добавляем информацию о боте в контекст
          if (!ctx.botInfo) {
            ctx.botInfo = await this.bot.telegram.getMe();
          }
        } catch (error) {
          console.error('Error in user middleware:', error);
        }
      }
      await next();
    });

    // ========== РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ ==========
    // Важен порядок: команды -> текстовые обработчики

    // 1. Команды (высший приоритет) - /start, /admin, /help
    this.setupCommands();

    // 2. Текстовые обработчики (низший приоритет) - кнопки меню, сообщения
    this.setupHandlers();

    // Обработка непойманных ошибок
    this.bot.catch((err, ctx) => {
      console.error(`Error for ${ctx.updateType}:`, err);
      try {
        ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
      } catch (e) {
        console.error('Even error reply failed:', e);
      }
    });
  }

  /**
   * Регистрация команд бота - обрабатываются ПЕРВЫМИ
   * Команды имеют высший приоритет перед текстовыми обработчиками
   */
  setupCommands() {
    console.log('🔧 Регистрация команд...');

    // Команда /admin - вход в админ-панель
    this.bot.command('admin', async (ctx) => {
      console.log('👑 Команда /admin от:', ctx.from.id);

      // Проверка прав администратора
      if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
        console.log('❌ Доступ запрещен для:', ctx.from.id);
        return ctx.reply('❌ Доступ запрещен. У вас нет прав администратора.');
      }

      console.log('✅ Доступ разрешен для:', ctx.from.username || ctx.from.first_name);

      // Загружаем клавиатуру админ-панели
      const { adminMainKeyboard } = require('./bot/keyboards/keyboards');

      // Отправляем сообщение с клавиатурой админ-панели
      await ctx.reply('🛠 Панель администратора', {
        reply_markup: adminMainKeyboard
      });
    });

    // Команда /start - приветствие и регистрация пользователя
    this.bot.start(async (ctx) => {
      console.log('🚀 Команда /start от:', ctx.from.first_name);

      const UserService = require('./services/UserService');
      const { userMainKeyboard } = require('./bot/keyboards/keyboards');

      // Создаем или получаем пользователя
      const user = await UserService.getOrCreateUser(ctx.from);

      const welcomeText = `🤖 Добро пожаловать в Content Manager Bot!

✨ Возможности:
• Автопостинг из RSS-лент
• AI-генерация контента
• Планирование публикаций
• Управление несколькими каналами

🎯 Ваш пробный период активен до: ${new Date(user.subscription.trialEndDate).toLocaleDateString('ru-RU')}

Используйте меню для управления ботом!`;

      // Отправляем приветственное сообщение с основной клавиатурой
      await ctx.reply(welcomeText, {
        reply_markup: userMainKeyboard
      });
    });

    // Команда /help - справка по боту
    this.bot.help((ctx) => {
      console.log('❓ Команда /help от:', ctx.from.first_name);

      ctx.reply(`📖 Справка по боту:

🔹 *Управление каналами* - добавьте бота как администратора в ваш канал
🔹 *RSS ленты* - настройте автоматический постинг новостей
🔹 *AI Генерация* - создавайте уникальный контент с помощью нейросети
🔹 *Тарифы* - выберите подходящий план подписки

Для начала работы добавьте бота в ваш канал как администратора!`, { parse_mode: 'Markdown' });
    });

    console.log('✅ Команды зарегистрированы');
  }

  /**
   * Регистрация текстовых обработчиков - обрабатываются ПОСЛЕ команд
   * Включает обработчики кнопок меню, сообщений, callback'ов
   */
  setupHandlers() {
    console.log('🔧 Регистрация обработчиков...');

    const setupCallbackHandlers = require('./bot/handlers/callbackHandlers');
    const setupAdminHandlers = require('./bot/handlers/adminHandlers');
    const setupUserHandlers = require('./bot/handlers/userHandlers');
    const setupChannelHandlers = require('./bot/handlers/channelHandlers');

    const setupAllHandlers = async () => {
      try {
        console.log('🔄 Подключение userHandlers...');
        await setupUserHandlers(this.bot);
        console.log('🔄 Подключение callbackHandlers...');
        await setupCallbackHandlers(this.bot);
        console.log('🔄 Подключение adminHandlers...');
        await setupAdminHandlers(this.bot);

        console.log('🔄 Подключение channelHandlers...');
        await setupChannelHandlers(this.bot);

        console.log('✅ Все обработчики подключены');
      } catch (error) {
        console.error('❌ Ошибка при подключении обработчиков:', error);
      }
    };

    setupAllHandlers();
  }

  /**
   * Настройка фоновых задач (cron jobs)
   * Выполняются по расписанию независимо от пользовательских действий
   */
  setupCronJobs() {
    // Ежедневный сброс лимитов в 00:00
    cron.schedule('0 0 * * *', async () => {
      console.log('🔄 Resetting daily limits...');
      const User = require('./models/User');
      await User.resetDailyLimits(); // Сброс дневных счетчиков постов

      const AIService = require('./services/AIService');
      AIService.resetDailyStats(); // Сброс дневной статистики AI
    });

    console.log('✅ Cron jobs setup completed');
  }

  /**
   * Запуск бота - конечная точка инициализации
   */
  start() {
    // Запускаем бота
    this.bot.launch();
    console.log('🤖 Бот запущен!');
    console.log('👑 Админы:', BOT_CONFIG.ADMIN_IDS);

    // Graceful shutdown - корректное завершение работы
    process.once('SIGINT', () => this.bot.stop('SIGINT'));  // Ctrl+C
    process.once('SIGTERM', () => this.bot.stop('SIGTERM')); // Сигнал завершения
  }
}

// Создаем и запускаем приложение
const app = new Application();
app.start();

// Экспортируем для возможного использования в других модулях
module.exports = app;