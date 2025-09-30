const Channel = require('../../models/Channel');
const UserService = require('../../services/UserService');

function setupChannelHandlers(bot) {
  // Обработка пересылаемых сообщений из каналов
  bot.on('message', async (ctx) => {
    if (ctx.message.forward_from_chat && ctx.message.forward_from_chat.type === 'channel') {
      const chat = ctx.message.forward_from_chat;
      
      try {
        // Проверяем, является ли бот администратором
        const chatMember = await ctx.telegram.getChatMember(chat.id, ctx.botInfo.id);
        
        if (chatMember.status === 'administrator' && chatMember.can_post_messages) {
          // Проверяем лимиты каналов
          const userChannels = await Channel.countDocuments({ owner: ctx.user._id });
          const maxChannels = ctx.user.limits.channels;
          
          if (userChannels >= maxChannels) {
            return ctx.reply(`❌ Вы достигли лимита каналов (${maxChannels}). 
Улучшите тарифный план чтобы добавить больше каналов.`);
          }
          
          // Создаем или обновляем канал
          const channel = await Channel.findOneAndUpdate(
            { telegramId: chat.id.toString(), owner: ctx.user._id },
            {
              title: chat.title,
              username: chat.username,
              owner: ctx.user._id
            },
            { upsert: true, new: true }
          );
          
          await ctx.reply(`✅ Канал "${chat.title}" успешно подключен! 

Настройте режим работы канала:`, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📰 Только RSS', callback_data: `set_mode_${channel._id}_rss` },
                  { text: '🤖 Только AI', callback_data: `set_mode_${channel._id}_ai` }
                ],
                [
                  { text: '🔀 Комбинированный', callback_data: `set_mode_${channel._id}_combined` }
                ],
                [
                  { text: '⚙️ Дополнительные настройки', callback_data: `channel_settings_${channel._id}` }
                ]
              ]
            }
          });
        } else {
          await ctx.reply('❌ Бот не имеет прав на публикацию в этом канале. Пожалуйста, предоставьте права администратора с разрешением на отправку сообщений.');
        }
      } catch (error) {
        console.error('Channel connection error:', error);
        await ctx.reply('❌ Не удалось подключить канал. Убедитесь, что бот добавлен как администратор.');
      }
    }
  });

  // Обработка смены режима канала
  bot.action(/set_mode_(.+)_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    const mode = ctx.match[2];
    
    await Channel.findByIdAndUpdate(channelId, {
      'settings.mode': mode
    });
    
    await ctx.editMessageText(`✅ Режим канала изменен на: ${mode}\n\nКанал готов к работе!`);
  });
}

module.exports = setupChannelHandlers;