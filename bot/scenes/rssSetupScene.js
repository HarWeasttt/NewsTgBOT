const { Scenes } = require('telegraf');
const RSSService = require('../../services/RSSService');

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

    const url = ctx.message.text;
    
    try {
      // Валидируем RSS
      await RSSService.parseFeed(url);
      ctx.wizard.state.rssUrl = url;
      
      await ctx.reply('✅ RSS лента валидна! Теперь введите ключевые слова для включения (через запятую) или отправьте "-" чтобы пропустить:');
      return ctx.wizard.next();
    } catch (error) {
      await ctx.reply('❌ Неверный RSS URL или лента недоступна. Попробуйте другой URL:');
    }
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('❌ Пожалуйста, введите ключевые слова');
      return;
    }

    const includeKeywords = ctx.message.text === '-' ? [] : 
      ctx.message.text.split(',').map(k => k.trim()).filter(k => k);
    
    ctx.wizard.state.includeKeywords = includeKeywords;
    
    await ctx.reply('🎯 Введите ключевые слова для исключения (через запятую) или отправьте "-" чтобы пропустить:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('❌ Пожалуйста, введите ключевые слова');
      return;
    }

    const excludeKeywords = ctx.message.text === '-' ? [] : 
      ctx.message.text.split(',').map(k => k.trim()).filter(k => k);
    
    // Сохраняем RSS источник
    const Channel = require('../../models/Channel');
    const channel = await Channel.findById(ctx.scene.state.channelId);
    
    if (!channel) {
      await ctx.reply('❌ Канал не найден');
      return ctx.scene.leave();
    }
    
    channel.rssSources.push({
      url: ctx.wizard.state.rssUrl,
      includeKeywords: ctx.wizard.state.includeKeywords,
      excludeKeywords: excludeKeywords
    });
    
    await channel.save();
    
    await ctx.reply(`✅ RSS лента успешно добавлена в канал "${channel.title}"!`);
    return ctx.scene.leave();
  }
);

module.exports = rssSetupScene;