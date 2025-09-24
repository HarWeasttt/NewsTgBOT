const { Prompt, Schedule } = require('../models');
const subscriptionService = require('../services/subscriptionService');
const Keyboards = require('../utils/keyboards');

class PromptController {
  async startAddPrompt(ctx) {
    const canAdd = await subscriptionService.canAddPrompt(ctx.session.user._id);
    
    if (!canAdd) {
      const limits = await subscriptionService.getUserLimits(ctx.session.user._id);
      await ctx.reply(
        `❌ Вы достигли лимита промтов для вашего тарифа (максимум ${limits.PROMPTS}).\n\nДля добавления большего количества промтов обновите тариф.`,
        Keyboards.backToCabinet()
      );
      return;
    }

    await ctx.reply(
      '🔍 **Создание нового промта**\n\n' +
      'Промт - это поисковый запрос для сбора новостей.\n\n' +
      '**Примеры промтов:**\n' +
      '• "Искусственный интеллект"\n' +
      '• "Криптовалюты Bitcoin"\n' +
      '• "Новости космоса"\n\n' +
      'Введите название для вашего промта:',
      Keyboards.cancelAction()
    );

    ctx.session.promptData = {};
    ctx.session.waitingForPromptName = true;
  }

  async handlePromptName(ctx) {
    if (!ctx.session.waitingForPromptName) return;

    ctx.session.promptData.name = ctx.message.text;
    ctx.session.waitingForPromptName = false;
    ctx.session.waitingForPromptQuery = true;

    await ctx.reply(
      '📝 Теперь введите поисковый запрос для новостей:\n\n' +
      '**Пример:** "Искусственный интеллект новости технологии"',
      Keyboards.cancelAction()
    );
  }

  async handlePromptQuery(ctx) {
    if (!ctx.session.waitingForPromptQuery) return;

    ctx.session.promptData.query = ctx.message.text;
    
    await ctx.reply(
      '🌐 Выберите язык для поиска новостей:',
      Markup.keyboard([['Русский', 'English'], ['❌ Отмена']]).resize()
    );

    ctx.session.waitingForPromptQuery = false;
    ctx.session.waitingForPromptLanguage = true;
  }

  async handlePromptLanguage(ctx) {
    if (!ctx.session.waitingForPromptLanguage) return;

    const languageMap = {
      'Русский': 'ru',
      'English': 'en'
    };

    ctx.session.promptData.language = languageMap[ctx.message.text] || 'ru';

    await ctx.reply(
      '🔍 Хотите добавить ключевые слова для исключения?\n\n' +
      '**Пример:** "спорт, политика, реклама"\n' +
      '(введите через запятую или "нет" чтобы пропустить)',
      Keyboards.cancelAction()
    );

    ctx.session.waitingForPromptLanguage = false;
    ctx.session.waitingForPromptExclude = true;
  }

  async handlePromptExclude(ctx) {
    if (!ctx.session.waitingForPromptExclude) return;

    let keywordsToExclude = [];
    
    if (ctx.message.text.toLowerCase() !== 'нет') {
      keywordsToExclude = ctx.message.text
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
    }

    // Создание промта
    const prompt = new Prompt({
      name: ctx.session.promptData.name,
      query: ctx.session.promptData.query,
      language: ctx.session.promptData.language,
      keywordsToExclude: keywordsToExclude,
      owner: ctx.session.user._id
    });

    await prompt.save();

    // Очистка сессии
    delete ctx.session.promptData;
    delete ctx.session.waitingForPromptExclude;

    await ctx.reply(
      `✅ Промт "${prompt.name}" успешно создан!\n\n` +
      `Запрос: "${prompt.query}"\n` +
      `Язык: ${prompt.language}\n` +
      `Исключения: ${keywordsToExclude.length ? keywordsToExclude.join(', ') : 'нет'}\n\n` +
      'Теперь настройте расписание для этого промта.',
      Keyboards.promptsManagement()
    );
  }

  async deletePrompt(ctx, promptId) {
    try {
      const prompt = await Prompt.findOne({ 
        _id: promptId, 
        owner: ctx.session.user._id 
      });

      if (!prompt) {
        await ctx.reply('❌ Промт не найден.');
        return;
      }

      // Удаляем связанные расписания
      await Schedule.deleteMany({ prompt: promptId });

      await Prompt.findByIdAndDelete(promptId);

      await ctx.reply(
        `✅ Промт "${prompt.name}" и связанные расписания удалены.`,
        Keyboards.promptsManagement()
      );

    } catch (error) {
      console.error('Prompt delete error:', error);
      await ctx.reply('❌ Ошибка при удалении промта.');
    }
  }

  async cancelAction(ctx) {
    // Очистка сессии
    delete ctx.session.promptData;
    delete ctx.session.waitingForPromptName;
    delete ctx.session.waitingForPromptQuery;
    delete ctx.session.waitingForPromptLanguage;
    delete ctx.session.waitingForPromptExclude;

    await ctx.reply('Действие отменено.', Keyboards.promptsManagement());
  }
}

module.exports = new PromptController();