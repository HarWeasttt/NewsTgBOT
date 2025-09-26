const { Scenes } = require('telegraf');
const { Channel } = require('../../models');
const Helpers = require('../../utils/helpers');
const Keyboards = require('../../utils/keyboards');

const addChannelScene = new Scenes.WizardScene(
  'ADD_CHANNEL_SCENE',
  async (ctx) => {
    await ctx.reply(
      '📺 **Добавление канала**\n\n' +
      'Перешлите любое сообщение из канала или введите @username:',
      Keyboards.cancelAction()
    );
    return ctx.wizard.next();
  },
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

      const hasRights = await Helpers.validateChannelRights(ctx.telegram, channelInfo.id);
      if (!hasRights) {
        await ctx.reply('❌ Бот не имеет прав на отправку сообщений в этот канал.');
        return;
      }

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
        `Канал "${channelInfo.title}" найден!\n\n` +
        'Введите шаблон для постов или используйте стандартный:\n\n' +
        'Стандартный шаблон: {title}\\n\\n{summary}\\n\\n{source_link}\n\n' +
        'Доступные переменные: {title}, {summary}, {source}, {source_link}, {date}, {time}',
        Keyboards.cancelAction()
      );

      return ctx.wizard.next();

    } catch (error) {
      console.error('Channel scene error:', error);
      await ctx.reply('❌ Ошибка при добавлении канала. Попробуйте еще раз.');
      return ctx.scene.leave();
    }
  },
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

addChannelScene.hears('❌ Отмена', (ctx) => {
  ctx.reply('Действие отменено.', Keyboards.backToCabinet());
  return ctx.scene.leave();
});

module.exports = addChannelScene;