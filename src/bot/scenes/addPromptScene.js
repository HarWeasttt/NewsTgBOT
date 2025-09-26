const { Scenes, Markup } = require('telegraf');
const { Prompt } = require('../../models');
const subscriptionService = require('../../services/subscriptionService');
const Keyboards = require('../../utils/keyboards');

const addPromptScene = new Scenes.WizardScene(
  'ADD_PROMPT_SCENE',
  
  // Шаг 1: Ввод названия промта
  async (ctx) => {
    // Проверка лимитов
    const canAdd = await subscriptionService.canAddPrompt(ctx.session.user._id);
    
    if (!canAdd) {
      const limits = await subscriptionService.getUserLimits(ctx.session.user._id);
      await ctx.reply(
        `❌ Вы достигли лимита промтов для вашего тарифа (максимум ${limits.PROMPTS}).\n\nДля добавления большего количества промтов обновите тариф.`,
        Keyboards.backToCabinet()
      );
      return ctx.scene.leave();
    }

    await ctx.reply(
      '🔍 **Создание нового промта**\n\n' +
      'Промт - это поисковый запрос для сбора новостей.\n\n' +
      '**Примеры хороших промтов:**\n' +
      '• "Искусственный интеллект и машинное обучение"\n' + 
      '• "Криптовалюты Bitcoin Ethereum"\n' +
      '• "Новости космоса NASA"\n' +
      '• "Технологии программирования"\n\n' +
      '📝 **Введите название для вашего промта:**\n' +
      '(например: "Новости ИИ" или "Криптовалюты")',
      Keyboards.cancelAction()
    );

    return ctx.wizard.next();
  },

  // Шаг 2: Ввод поискового запроса
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
      return ctx.scene.leave();
    }

    const name = ctx.message.text.trim();
    
    // Валидация названия
    if (name.length < 2) {
      await ctx.reply('❌ Название слишком короткое. Введите название длиной от 2 символов.');
      return;
    }

    if (name.length > 50) {
      await ctx.reply('❌ Название слишком длинное. Максимум 50 символов.');
      return;
    }

    // Проверка на уникальность названия
    const existingPrompt = await Prompt.findOne({
      name: name,
      owner: ctx.session.user._id
    });

    if (existingPrompt) {
      await ctx.reply('❌ Промт с таким названием уже существует. Введите другое название.');
      return;
    }

    ctx.wizard.state.promptData = { name };
    
    await ctx.reply(
      `📝 **Название:** ${name}\n\n` +
      '🔎 **Теперь введите поисковый запрос для новостей:**\n\n' +
      '**Рекомендации:**\n' +
      '• Используйте конкретные ключевые слова\n' +
      '• Избегайте слишком общих запросов\n' +
      '• Можно использовать несколько слов\n\n' +
      '**Примеры:**\n' +
      '• "искусственный интеллект новости технологии"\n' +
      '• "криптовалюты bitcoin курс майнинг"\n' +
      '• "космос NASA запуск ракеты"',
      Keyboards.cancelAction()
    );

    return ctx.wizard.next();
  },

  // Шаг 3: Выбор языка
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
      return ctx.scene.leave();
    }

    const query = ctx.message.text.trim();
    
    // Валидация запроса
    if (query.length < 3) {
      await ctx.reply('❌ Запрос слишком короткий. Введите не менее 3 символов.');
      return;
    }

    if (query.length > 100) {
      await ctx.reply('❌ Запрос слишком длинный. Максимум 100 символов.');
      return;
    }

    ctx.wizard.state.promptData.query = query;

    await ctx.reply(
      `🔍 **Поисковый запрос:** "${query}"\n\n` +
      '🌐 **Выберите язык для поиска новостей:**',
      Markup.keyboard([
        ['🇷🇺 Русский', '🇺🇸 English'],
        ['❌ Отмена']
      ]).resize()
    );

    return ctx.wizard.next();
  },

  // Шаг 4: Ключевые слова для исключения
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
      return ctx.scene.leave();
    }

    const languageMap = {
      '🇷🇺 Русский': 'ru',
      'Русский': 'ru',
      '🇺🇸 English': 'en', 
      'English': 'en'
    };

    const language = languageMap[ctx.message.text] || 'ru';
    ctx.wizard.state.promptData.language = language;

    await ctx.reply(
      `🌐 **Язык поиска:** ${language === 'ru' ? 'Русский' : 'Английский'}\n\n` +
      '🚫 **Хотите добавить ключевые слова для исключения?**\n\n' +
      'Это полезно, если в результатах попадаются нерелевантные новости.\n\n' +
      '**Пример:** "спорт, политика, реклама, COVID"\n' +
      '(введите через запятую или "нет" чтобы пропустить)',
      Keyboards.cancelAction()
    );

    return ctx.wizard.next();
  },

  // Шаг 5: Подтверждение и сохранение
  async (ctx) => {
    if (ctx.message.text === '❌ Отмена') {
      await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
      return ctx.scene.leave();
    }

    let keywordsToExclude = [];
    
    if (ctx.message.text.toLowerCase() !== 'нет' && 
        ctx.message.text.toLowerCase() !== 'no' &&
        ctx.message.text.trim() !== '') {
      
      keywordsToExclude = ctx.message.text
        .split(',')
        .map(keyword => keyword.trim())
        .filter(keyword => keyword.length > 0)
        .slice(0, 10); // Ограничение на количество ключевых слов
    }

    const { name, query, language } = ctx.wizard.state.promptData;

    // Показываем сводку
    let summaryMessage = `📋 **Сводка по промту:**\n\n`;
    summaryMessage += `📝 **Название:** ${name}\n`;
    summaryMessage += `🔍 **Запрос:** "${query}"\n`;
    summaryMessage += `🌐 **Язык:** ${language === 'ru' ? 'Русский' : 'Английский'}\n`;
    summaryMessage += `🚫 **Исключения:** ${keywordsToExclude.length > 0 ? keywordsToExclude.join(', ') : 'нет'}\n\n`;

    // Тестовый поиск (опционально)
    summaryMessage += '⏳ Выполняю тестовый поиск...';
    
    const testMessage = await ctx.reply(summaryMessage);

    try {
      // Создание промта
      const prompt = new Prompt({
        name: name,
        query: query,
        language: language,
        keywordsToExclude: keywordsToExclude,
        owner: ctx.session.user._id
      });

      await prompt.save();

      // Обновляем сообщение с результатом
      const successMessage = `✅ **Промт "${name}" успешно создан!**\n\n` +
        `🔍 Запрос: "${query}"\n` +
        `🌐 Язык: ${language === 'ru' ? 'Русский' : 'Английский'}\n` +
        `🚫 Исключения: ${keywordsToExclude.length ? keywordsToExclude.join(', ') : 'нет'}\n\n` +
        '📊 **Что дальше?**\n' +
        '1. Настройте расписание для этого промта\n' +
        '2. Привяжите промт к вашим каналам\n' +
        '3. Бот начнет автоматическую публикацию новостей';

      await ctx.telegram.editMessageText(
        ctx.chat.id,
        testMessage.message_id,
        null,
        successMessage,
        { parse_mode: 'Markdown' }
      );

      await ctx.reply(
        'Выберите действие:',
        Keyboards.promptsManagement()
      );

    } catch (error) {
      console.error('Prompt creation error:', error);
      
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        testMessage.message_id,
        null,
        '❌ **Ошибка при создании промта**\n\nПожалуйста, попробуйте еще раз или обратитесь в поддержку.',
        { parse_mode: 'Markdown' }
      );
    }

    return ctx.scene.leave();
  }
);

// Обработчики для кнопки отмены
addPromptScene.hears('❌ Отмена', async (ctx) => {
  await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
  return ctx.scene.leave();
});

// Middleware для валидации
addPromptScene.use(async (ctx, next) => {
  // Проверяем, что пользователь авторизован
  if (!ctx.session.user) {
    await ctx.reply('❌ Пожалуйста, начните с команды /start');
    return ctx.scene.leave();
  }
  
  // Проверяем активную подписку (кроме шага отмены)
  if (ctx.message.text !== '❌ Отмена' && !ctx.session.user.hasActiveSubscription()) {
    await ctx.reply(
      '❌ Ваша подписка не активна. Для создания промтов необходимо оформить подписку.',
      Keyboards.backToMain()
    );
    return ctx.scene.leave();
  }
  
  await next();
});

// Обработка ошибок
addPromptScene.on('error', (error, ctx) => {
  console.error('Prompt scene error:', error);
  ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте еще раз.');
  return ctx.scene.leave();
});

module.exports = addPromptScene;