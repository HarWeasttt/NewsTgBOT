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

class Application {
  constructor() {
    this.bot = new Telegraf(BOT_CONFIG.TOKEN);
    this.setupDatabase();
    this.setupBot();
    this.setupCronJobs();
  }

  async setupDatabase() {
    try {
      await mongoose.connect(BOT_CONFIG.MONGODB_URI);
      console.log('✅ MongoDB подключена');
    } catch (error) {
      console.error('❌ Ошибка подключения к MongoDB:', error);
      process.exit(1);
    }
  }

  setupBot() {
    // Загружаем сцены
    const rssSetupScene = require('./bot/scenes/rssSetupScene');
    const aiPostScene = require('./bot/scenes/aiPostScene');
    
    // Создаем stage для сцен
    const stage = new Scenes.Stage([rssSetupScene, aiPostScene]);
    
    // Middleware
    this.bot.use(session());
    this.bot.use(stage.middleware());
    
    // Добавляем пользователя в контекст
    this.bot.use(async (ctx, next) => {
      if (ctx.from) {
        try {
          const UserService = require('./services/UserService');
          ctx.user = await UserService.getOrCreateUser(ctx.from);
          ctx.isAdmin = BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id);
          
          // Добавляем botInfo в контекст для удобства
          if (!ctx.botInfo) {
            ctx.botInfo = await this.bot.telegram.getMe();
          }
        } catch (error) {
          console.error('Error in user middleware:', error);
        }
      }
      await next();
    });

    // СНАЧАЛА команды, ПОТОМ текстовые обработчики
    this.setupCommands();
    this.setupHandlers();

    // Обработка ошибок
    this.bot.catch((err, ctx) => {
      console.error(`Error for ${ctx.updateType}:`, err);
      try {
        ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
      } catch (e) {
        console.error('Even error reply failed:', e);
      }
    });
  
  }

  setupCommands() {
    // Команда /admin - должна быть ПЕРВОЙ
    this.bot.command('admin', async (ctx) => {
      console.log('Admin command received from:', ctx.from.id);
      
      if (!BOT_CONFIG.ADMIN_IDS.includes(ctx.from.id)) {
        console.log('Access denied for user:', ctx.from.id);
        return ctx.reply('❌ Доступ запрещен. У вас нет прав администратора.');
      }

      console.log('Admin access granted for:', ctx.from.username || ctx.from.first_name);
      
      const { adminMainKeyboard } = require('./bot/keyboards/keyboards');
      
      await ctx.reply('🛠 Панель администратора', {
        reply_markup: adminMainKeyboard
      });
    });

    // Команда /start
    this.bot.start(async (ctx) => {
      const UserService = require('./services/UserService');
      const { userMainKeyboard } = require('./bot/keyboards/keyboards');
      
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
    this.bot.help((ctx) => {
      ctx.reply(`📖 Справка по боту:

🔹 *Управление каналами* - добавьте бота как администратора в ваш канал
🔹 *RSS ленты* - настройте автоматический постинг новостей
🔹 *AI Генерация* - создавайте уникальный контент с помощью нейросети
🔹 *Тарифы* - выберите подходящий план подписки

Для начала работы добавьте бота в ваш канал как администратора!`, { parse_mode: 'Markdown' });
    });
  }

  setupHandlers() {
    // Загружаем все обработчики ПОСЛЕ команд
    const setupUserHandlers = require('./bot/handlers/userHandlers');
    const setupAdminHandlers = require('./bot/handlers/adminHandlers');
    const setupChannelHandlers = require('./bot/handlers/channelHandlers');
    const setupCallbackHandlers = require('./bot/handlers/callbackHandlers');

    setupUserHandlers(this.bot);
    setupAdminHandlers(this.bot);
    setupChannelHandlers(this.bot);
    setupCallbackHandlers(this.bot);
  }

  setupCronJobs() {
    // Ежедневный сброс лимитов в 00:00
    cron.schedule('0 0 * * *', async () => {
      console.log('🔄 Resetting daily limits...');
      const User = require('./models/User');
      await User.resetDailyLimits();
      
      const AIService = require('./services/AIService');
      AIService.resetDailyStats();
    });

    console.log('✅ Cron jobs setup completed');
  }

  start() {
    this.bot.launch();
    console.log('🤖 Бот запущен!');
    console.log('👑 Админы:', BOT_CONFIG.ADMIN_IDS);

    // Graceful shutdown
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}

// Запуск приложения
const app = new Application();
app.start();

module.exports = app;