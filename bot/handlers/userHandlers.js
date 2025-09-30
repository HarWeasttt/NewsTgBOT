const User = require('../../models/User');
const Channel = require('../../models/Channel');
const UserService = require('../../services/UserService');
const AIService = require('../../services/AIService');
const { userMainKeyboard, aiTonesKeyboard } = require('../keyboards/keyboards');
const { SUBSCRIPTION_PLANS } = require('../../config');

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
  // Команда старт
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

  // AI Генерация
  bot.hears('🤖 AI Генерация', async (ctx) => {
    if (!ctx.user.subscription.isTrial && !ctx.user.subscription.aiAccess) {
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
// Добавляем в существующий файл:

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
  ctx.scene.enter('rss-setup-scene', { channelId });
});

// AI Генерация с выбором канала
bot.action(/ai_generate_(.+)/, async (ctx) => {
  const channelId = ctx.match[1];
  ctx.scene.enter('ai-post-scene', { channelId });
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
        text: `⚙️ ${channel.title}`, 
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
    return ctx.answerCbQuery('Канал не найден');
  }
  
  const message = `📊 Канал: ${channel.title}\n\n` +
    `🔧 Режим: ${channel.settings.mode}\n` +
    `📰 RSS источников: ${channel.rssSources.length}\n` +
    `🤖 AI темы: ${channel.aiSettings.topics.join(', ') || 'не заданы'}\n` +
    `🎨 Стиль AI: ${channel.aiSettings.tone}\n\n` +
    `Выберите действие:`;
  
  await ctx.editMessageText(message, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📰 Управление RSS', callback_data: `manage_rss_${channel._id}` },
          { text: '🤖 AI Настройки', callback_data: `ai_settings_${channel._id}` }
        ],
        [
          { text: '🚀 Создать пост', callback_data: `ai_generate_${channel._id}` },
          { text: '⏰ Расписание', callback_data: `schedule_settings_${channel._id}` }
        ],
        [
          { text: '🔙 Назад', callback_data: 'manage_channels' }
        ]
      ]
    }
  });
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
}

module.exports = setupUserHandlers;