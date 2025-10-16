const { Scenes } = require('telegraf');
const RSSService = require('../../services/RSSService');
const Channel = require('../../models/Channel');

const rssSetupScene = new Scenes.WizardScene(
  'rss-setup-scene',
  async (ctx) => {
    await ctx.reply('📥 Введите URL RSS ленты:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('❌ Пожалуйста, введите корректный URL');
      return;
    }

    const url = ctx.message.text.trim();
    
    try {
      // Показываем индикатор загрузки
      await ctx.reply('🔍 Проверяем RSS ленту...');
      
      // Тестируем RSS ленту
      const testResult = await RSSService.testRssFeed(url);
      
      if (!testResult.success) {
        await ctx.reply(`❌ ${testResult.error}\n\nПопробуйте другой URL:`);
        return; // Остаемся на этом шаге
      }
      
      // Сохраняем информацию о RSS
      ctx.wizard.state.rssUrl = url;
      ctx.wizard.state.feedInfo = testResult;
      
      // Показываем информацию о ленте
      let infoMessage = `✅ RSS лента валидна!\n\n` +
        `📰 Название: ${testResult.title}\n` +
        `📝 Описание: ${testResult.description}\n` +
        `📊 Постов в ленте: ${testResult.itemCount}\n`;
      
      if (testResult.lastItem) {
        infoMessage += `🕐 Последний пост: ${testResult.lastItem.title}\n`;
      }
      
      infoMessage += `\n🎯 Теперь введите ключевые слова для *включения* (через запятую):\n` +
        `• Только посты с этими словами будут публиковаться\n` +
        `• Или отправьте "-" чтобы публиковать все посты`;
      
      await ctx.reply(infoMessage, { parse_mode: 'Markdown' });
      return ctx.wizard.next();
      
    } catch (error) {
      console.error('RSS test error:', error);
      await ctx.reply('❌ Произошла ошибка при проверке RSS. Попробуйте другой URL:');
    }
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('❌ Пожалуйста, введите ключевые слова');
      return;
    }

    const input = ctx.message.text.trim();
    const includeKeywords = input === '-' ? [] : 
      input.split(',').map(k => k.trim()).filter(k => k);
    
    ctx.wizard.state.includeKeywords = includeKeywords;
    
    const message = `🎯 Теперь введите ключевые слова для *исключения* (через запятую):\n` +
      `• Посты с этими словами не будут публиковаться\n` +
      `• Или отправьте "-" чтобы не исключать посты\n\n` +
      `✅ Включены слова: ${includeKeywords.length > 0 ? includeKeywords.join(', ') : 'все посты'}`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('❌ Пожалуйста, введите ключевые слова');
      return;
    }

    const input = ctx.message.text.trim();
    const excludeKeywords = input === '-' ? [] : 
      input.split(',').map(k => k.trim()).filter(k => k);
    
    // Сохраняем RSS источник
    try {
      const channel = await Channel.findById(ctx.scene.state.channelId);
      
      if (!channel) {
        await ctx.reply('❌ Канал не найден');
        return ctx.scene.leave();
      }
      
      // Проверяем, не добавлена ли уже эта RSS лента
      const existingSource = channel.rssSources.find(source => source.url === ctx.wizard.state.rssUrl);
      if (existingSource) {
        await ctx.reply('❌ Эта RSS лента уже добавлена в канал');
        return ctx.scene.leave();
      }
      
      // Добавляем новый RSS источник
      channel.rssSources.push({
        url: ctx.wizard.state.rssUrl,
        includeKeywords: ctx.wizard.state.includeKeywords,
        excludeKeywords: excludeKeywords,
        isActive: true,
        lastProcessed: null
      });
      
      await channel.save();
      
      // Формируем сообщение об успехе
      let successMessage = `✅ RSS лента успешно добавлена в канал "${channel.title}"!\n\n` +
        `📰 Лента: ${ctx.wizard.state.feedInfo.title}\n` +
        `🔗 URL: ${ctx.wizard.state.rssUrl}\n` +
        `✅ Включить: ${ctx.wizard.state.includeKeywords.length > 0 ? ctx.wizard.state.includeKeywords.join(', ') : 'все посты'}\n` +
        `❌ Исключить: ${excludeKeywords.length > 0 ? excludeKeywords.join(', ') : 'нет'}\n\n` +
        `📊 Автопостинг начнется в ближайшее время.`;
      
      await ctx.reply(successMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { 
                text: '📰 Управление RSS', 
                callback_data: `manage_rss_${channel._id}` 
              },
              { 
                text: '⚙️ Настройки канала', 
                callback_data: `channel_detail_${channel._id}` 
              }
            ]
          ]
        }
      });
      
      return ctx.scene.leave();
      
    } catch (error) {
      console.error('Save RSS error:', error);
      await ctx.reply('❌ Произошла ошибка при сохранении RSS ленты');
      return ctx.scene.leave();
    }
  }
);

// Добавляем обработку команды отмены
rssSetupScene.hears('/cancel', async (ctx) => {
  await ctx.reply('❌ Добавление RSS ленты отменено');
  return ctx.scene.leave();
});

// Обработка любых других команд во время сцены
rssSetupScene.on('message', async (ctx) => {
  // Пропускаем текстовые сообщения (они обрабатываются в шагах)
  if (ctx.message && ctx.message.text) {
    return ctx.wizard.step(ctx, async () => {});
  }
  
  // На другие типы сообщений отвечаем подсказкой
  await ctx.reply('❌ Пожалуйста, введите текст или используйте /cancel для отмены');
});

module.exports = rssSetupScene;