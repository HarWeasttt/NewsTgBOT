const { Channel, Schedule } = require('../models');
const subscriptionService = require('../services/subscriptionService');
const Helpers = require('../utils/helpers');
const Keyboards = require('../utils/keyboards');

class ChannelController {
  async startAddChannel(ctx) {
    const canAdd = await subscriptionService.canAddChannel(ctx.session.user._id);
    
    if (!canAdd) {
      const limits = await subscriptionService.getUserLimits(ctx.session.user._id);
      await ctx.reply(
        `❌ Вы достигли лимита каналов для вашего тарифа (максимум ${limits.CHANNELS}).\n\nДля добавления большего количества каналов обновите тариф.`,
        Keyboards.backToCabinet()
      );
      return;
    }

    await ctx.reply(
      '📺 **Добавление канала**\n\n' +
      '1. Сделайте бота администратором вашего канала\n' +
      '2. Дайте права на отправку сообщений\n' +
      '3. Перешлите любое сообщение из канала или введите @username канала\n\n' +
      'Или нажмите "❌ Отмена" для возврата',
      Keyboards.cancelAction()
    );

    ctx.session.waitingForChannel = true;
  }

  async handleChannelInput(ctx) {
    if (!ctx.session.waitingForChannel) return;

    let channelInfo;
    
    try {
      if (ctx.message.forward_from_chat) {
        // Пересланное сообщение из канала
        channelInfo = ctx.message.forward_from_chat;
      } else if (ctx.message.text.startsWith('@')) {
        // Введен username канала
        const username = ctx.message.text.replace('@', '');
        channelInfo = await ctx.telegram.getChat(`@${username}`);
      } else {
        await ctx.reply('Пожалуйста, перешлите сообщение из канала или введите @username');
        return;
      }

      // Проверка типа чата
      if (channelInfo.type !== 'channel') {
        await ctx.reply('❌ Это не канал. Пожалуйста, укажите Telegram канал.');
        return;
      }

      // Проверка прав бота
      const hasRights = await Helpers.validateChannelRights(ctx.telegram, channelInfo.id);
      if (!hasRights) {
        await ctx.reply(
          '❌ Бот не имеет прав на отправку сообщений в этот канал.\n\n' +
          'Пожалуйста, сделайте бота администратором с правом отправки сообщений и попробуйте снова.'
        );
        return;
      }

      // Проверка, не добавлен ли канал уже
      const existingChannel = await Channel.findOne({ telegramId: channelInfo.id });
      if (existingChannel) {
        await ctx.reply('❌ Этот канал уже добавлен в систему.');
        return;
      }

      // Создание канала
      const channel = new Channel({
        telegramId: channelInfo.id,
        title: channelInfo.title,
        username: channelInfo.username,
        owner: ctx.session.user._id
      });

      await channel.save();

      delete ctx.session.waitingForChannel;

      await ctx.reply(
        `✅ Канал "${channelInfo.title}" успешно добавлен!\n\n` +
        'Теперь вы можете создать промты и настроить расписание публикаций.',
        Keyboards.channelsManagement()
      );

    } catch (error) {
      console.error('Channel add error:', error);
      await ctx.reply(
        '❌ Ошибка при добавлении канала. Убедитесь, что:\n\n' +
        '• Канал существует\n' +
        '• Бот добавлен как администратор\n' +
        '• Бот имеет права на отправку сообщений\n' +
        '• Вы переслали сообщение из канала или указали правильный @username'
      );
    }
  }

  async deleteChannel(ctx, channelId) {
    try {
      const channel = await Channel.findOne({ 
        _id: channelId, 
        owner: ctx.session.user._id 
      });

      if (!channel) {
        await ctx.reply('❌ Канал не найден.');
        return;
      }

      // Удаляем связанные расписания
      await Schedule.deleteMany({ channel: channelId });

      await Channel.findByIdAndDelete(channelId);

      await ctx.reply(
        `✅ Канал "${channel.title}" и связанные расписания удалены.`,
        Keyboards.channelsManagement()
      );

    } catch (error) {
      console.error('Channel delete error:', error);
      await ctx.reply('❌ Ошибка при удалении канала.');
    }
  }

  async cancelAction(ctx) {
    if (ctx.session.waitingForChannel) {
      delete ctx.session.waitingForChannel;
    }

    await ctx.reply('Действие отменено.', Keyboards.channelsManagement());
  }
}

module.exports = new ChannelController();