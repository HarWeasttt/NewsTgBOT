const Channel = require('../../models/Channel');
const UserService = require('../../services/UserService');
const AutoPostService = require('../../services/AutoPostService');

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

          // Проверяем, не подключен ли уже канал
          const existingChannel = await Channel.findOne({ 
            channelId: chat.id.toString(), 
            owner: ctx.user._id 
          });

          let channel;
          
          if (existingChannel) {
            // Обновляем существующий канал
            existingChannel.title = chat.title;
            existingChannel.username = chat.username;
            existingChannel.isActive = true;
            existingChannel.settings.autoPublish = true;
            await existingChannel.save();
            channel = existingChannel;
          } else {
            // Создаем новый канал
            channel = new Channel({
              title: chat.title,
              channelId: chat.id.toString(),
              username: chat.username,
              owner: ctx.user._id,
              settings: {
                mode: 'rss',
                autoPublish: true,
                schedule: {
                  enabled: false,
                  times: [],
                  interval: 60
                },
                postSettings: {
                  includeImages: true,
                  maxLength: 4000,
                  addHashtags: true,
                  watermark: '',
                  parseMode: 'HTML'
                }
              },
              rssSources: [],
              aiSettings: {
                tone: 'professional',
                topics: []
              },
              statistics: {
                totalPosts: 0,
                postsToday: 0
              },
              isActive: true
            });
            await channel.save();
          }

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

    try {
      await Channel.findByIdAndUpdate(channelId, {
        'settings.mode': mode
      });

      await ctx.answerCbQuery(`✅ Режим изменен на: ${mode}`);
      await ctx.editMessageText(`✅ Режим канала изменен на: ${mode}\n\nКанал готов к работе!`);
    } catch (error) {
      console.error('Set mode error:', error);
      await ctx.answerCbQuery('❌ Ошибка при изменении режима');
    }
  });

  // Настройки автопостинга
  bot.action(/autopost_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const stats = await AutoPostService.getAutoPostStats();

      const message = `🚀 Настройки автопостинга: ${channel.title}\n\n` +
        `📊 Статус: ${channel.settings.autoPublish ? '✅ Включен' : '❌ Выключен'}\n` +
        `🔧 Режим: ${channel.settings.mode}\n` +
        `⏰ Расписание: ${channel.settings.schedule.enabled ? '✅ Включено' : '❌ Выключено'}\n` +
        `🕐 Время публикаций: ${channel.settings.schedule.times.join(', ') || 'не задано'}\n` +
        `📅 Интервал: ${channel.settings.schedule.interval} минут\n\n` +
        `📈 Статистика системы:\n` +
        `• Всего каналов с автопостингом: ${stats.totalChannels}\n` +
        `• Активных с расписанием: ${stats.activeChannels}\n` +
        `• RSS каналов: ${stats.rssChannels}\n` +
        `• AI каналов: ${stats.aiChannels}\n\n` +
        `Управление настройками:`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: channel.settings.autoPublish ? '❌ Выключить' : '✅ Включить',
                callback_data: `toggle_autopost_${channel._id}`
              },
              {
                text: '⏰ Расписание',
                callback_data: `schedule_settings_${channel._id}`
              }
            ],
            [
              {
                text: '🔧 Режим работы',
                callback_data: `mode_settings_${channel._id}`
              },
              {
                text: '⚙️ Настройки постов',
                callback_data: `post_settings_${channel._id}`
              }
            ],
            [
              {
                text: '🚀 Запустить сейчас',
                callback_data: `force_process_${channel._id}`
              },
              {
                text: '📊 Статистика',
                callback_data: `channel_stats_${channel._id}`
              }
            ],
            [
              {
                text: '🔙 Назад',
                callback_data: `channel_settings_${channel._id}`
              }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Autopost settings error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке настроек');
    }
  });

  // Переключение автопостинга
  bot.action(/toggle_autopost_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      channel.settings.autoPublish = !channel.settings.autoPublish;
      await channel.save();

      const status = channel.settings.autoPublish ? 'включен' : 'выключен';
      await ctx.answerCbQuery(`✅ Автопостинг ${status}`);

      // Обновляем сообщение
      await ctx.editMessageText(`✅ Автопостинг для канала "${channel.title}" ${status}!`, {
        reply_markup: {
          inline_keyboard: [
            [{
              text: '🔙 К настройкам',
              callback_data: `autopost_settings_${channel._id}`
            }]
          ]
        }
      });
    } catch (error) {
      console.error('Toggle autopost error:', error);
      await ctx.answerCbQuery('❌ Ошибка при переключении автопостинга');
    }
  });

  // Настройки расписания
  bot.action(/schedule_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const message = `⏰ Настройки расписания: ${channel.title}\n\n` +
        `Текущий статус: ${channel.settings.schedule.enabled ? '✅ Включено' : '❌ Выключено'}\n` +
        `Время публикаций: ${channel.settings.schedule.times.join(', ') || 'не задано'}\n` +
        `Интервал: ${channel.settings.schedule.interval} минут\n\n` +
        `Примеры времени: 09:00, 14:30, 19:45\n` +
        `Можно указать несколько времен через запятую\n\n` +
        `Доступные команды:`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🔄 Вкл/Выкл',
                callback_data: `toggle_schedule_${channel._id}`
              },
              {
                text: '✏️ Время',
                callback_data: `edit_schedule_times_${channel._id}`
              }
            ],
            [
              {
                text: '📅 Интервал',
                callback_data: `edit_schedule_interval_${channel._id}`
              },
              {
                text: '🔄 Сбросить',
                callback_data: `reset_schedule_${channel._id}`
              }
            ],
            [
              {
                text: '🔙 Назад',
                callback_data: `autopost_settings_${channel._id}`
              }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Schedule settings error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке расписания');
    }
  });

  // Переключение расписания
  bot.action(/toggle_schedule_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      channel.settings.schedule.enabled = !channel.settings.schedule.enabled;
      await channel.save();

      const status = channel.settings.schedule.enabled ? 'включено' : 'выключено';
      await ctx.answerCbQuery(`✅ Расписание ${status}`);

      // Возвращаемся к настройкам расписания
      await ctx.editMessageText(`✅ Расписание автопостинга для "${channel.title}" ${status}!`, {
        reply_markup: {
          inline_keyboard: [
            [{
              text: '🔙 К расписанию',
              callback_data: `schedule_settings_${channel._id}`
            }]
          ]
        }
      });
    } catch (error) {
      console.error('Toggle schedule error:', error);
      await ctx.answerCbQuery('❌ Ошибка при переключении расписания');
    }
  });

  // Редактирование времени расписания
  bot.action(/edit_schedule_times_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      await ctx.editMessageText(`⏰ Укажите время публикаций для канала "${channel.title}":\n\n` +
        `Формат: ЧЧ:MM\n` +
        `Пример: 09:00, 14:30, 19:45\n` +
        `Можно указать несколько времен через запятую\n\n` +
        `Текущее время: ${channel.settings.schedule.times.join(', ') || 'не задано'}\n\n` +
        `Отправьте новое время:`);

      ctx.session = ctx.session || {};
      ctx.session.waitingForScheduleTimes = true;
      ctx.session.editingChannelId = channelId;
    } catch (error) {
      console.error('Edit schedule times error:', error);
      await ctx.answerCbQuery('❌ Ошибка при настройке времени');
    }
  });

  // Редактирование интервала
  bot.action(/edit_schedule_interval_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      await ctx.editMessageText(`📅 Укажите интервал публикаций (в минутах) для канала "${channel.title}":\n\n` +
        `Текущий интервал: ${channel.settings.schedule.interval} минут\n\n` +
        `Рекомендуемые интервалы:\n` +
        `• 30 минут - частое обновление\n` +
        `• 60 минут - стандартный режим\n` +
        `• 120 минут - редкие публикации\n\n` +
        `Отправьте новый интервал (число):`);

      ctx.session = ctx.session || {};
      ctx.session.waitingForScheduleInterval = true;
      ctx.session.editingChannelId = channelId;
    } catch (error) {
      console.error('Edit schedule interval error:', error);
      await ctx.answerCbQuery('❌ Ошибка при настройке интервала');
    }
  });

  // Настройки режима работы
  bot.action(/mode_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const message = `🔧 Режим работы: ${channel.title}\n\n` +
        `Текущий режим: ${channel.settings.mode}\n\n` +
        `📰 *Только RSS* - посты из RSS лент\n` +
        `🤖 *Только AI* - AI генерация постов\n` +
        `🔀 *Комбинированный* - сначала RSS, если нет новых - AI\n\n` +
        `Выберите новый режим:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📰 Только RSS',
                callback_data: `set_mode_${channel._id}_rss`
              },
              {
                text: '🤖 Только AI',
                callback_data: `set_mode_${channel._id}_ai`
              }
            ],
            [
              {
                text: '🔀 Комбинированный',
                callback_data: `set_mode_${channel._id}_combined`
              }
            ],
            [
              {
                text: '🔙 Назад',
                callback_data: `autopost_settings_${channel._id}`
              }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Mode settings error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке режимов');
    }
  });

  // Настройки постов
  bot.action(/post_settings_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];
    
    try {
      const channel = await Channel.findById(channelId);
      if (!channel) {
        await ctx.answerCbQuery('❌ Канал не найден');
        return;
      }

      const message = `⚙️ Настройки постов: ${channel.title}\n\n` +
        `📷 Изображения: ${channel.settings.postSettings.includeImages ? '✅' : '❌'}\n` +
        `📏 Макс. длина: ${channel.settings.postSettings.maxLength} символов\n` +
        `🏷️ Хештеги: ${channel.settings.postSettings.addHashtags ? '✅' : '❌'}\n` +
        `💧 Водяной знак: ${channel.settings.postSettings.watermark || 'нет'}\n` +
        `📝 Формат: ${channel.settings.postSettings.parseMode}\n\n` +
        `Изменить настройки:`;

      await ctx.editMessageText(message, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📷 Изображения',
                callback_data: `toggle_images_${channel._id}`
              },
              {
                text: '🏷️ Хештеги',
                callback_data: `toggle_hashtags_${channel._id}`
              }
            ],
            [
              {
                text: '📏 Длина',
                callback_data: `set_length_${channel._id}`
              },
              {
                text: '💧 Водяной знак',
                callback_data: `set_watermark_${channel._id}`
              }
            ],
            [
              {
                text: '📝 Формат',
                callback_data: `set_parse_mode_${channel._id}`
              }
            ],
            [
              {
                text: '🔙 Назад',
                callback_data: `autopost_settings_${channel._id}`
              }
            ]
          ]
        }
      });
    } catch (error) {
      console.error('Post settings error:', error);
      await ctx.answerCbQuery('❌ Ошибка при загрузке настроек постов');
    }
  });

  // Принудительный запуск обработки
  bot.action(/force_process_(.+)/, async (ctx) => {
    const channelId = ctx.match[1];

    await ctx.answerCbQuery('🔄 Запускаем обработку...');

    try {
      const result = await AutoPostService.forceProcessChannel(channelId);

      if (result.published > 0) {
        await ctx.editMessageText(`✅ Обработка завершена!\n\nОпубликовано постов: ${result.published}\n\nКанал продолжит работу по расписанию.`);
      } else {
        await ctx.editMessageText(`ℹ️ Обработка завершена.\n\nНовых постов для публикации не найдено.\nПроверьте настройки RSS или AI.`);
      }
    } catch (error) {
      console.error('Force process error:', error);
      await ctx.editMessageText('❌ Ошибка при обработке канала');
    }
  });

  // Обработка текстовых сообщений для настроек
  bot.on('text', async (ctx) => {
    if (!ctx.session) return;

    if (ctx.session.waitingForScheduleTimes && ctx.session.editingChannelId) {
      const timesText = ctx.message.text;
      const channelId = ctx.session.editingChannelId;

      delete ctx.session.waitingForScheduleTimes;
      delete ctx.session.editingChannelId;

      try {
        const channel = await Channel.findById(channelId);
        const times = timesText.split(',').map(time => time.trim()).filter(time => {
          // Проверяем формат времени
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
        });

        if (times.length === 0) {
          await ctx.reply('❌ Неверный формат времени. Используйте формат ЧЧ:MM');
          return;
        }

        channel.settings.schedule.times = times;
        await channel.save();

        await ctx.reply(`✅ Время расписания обновлено: ${times.join(', ')}`, {
          reply_markup: {
            inline_keyboard: [
              [{
                text: '🔙 К расписанию',
                callback_data: `schedule_settings_${channelId}`
              }]
            ]
          }
        });

      } catch (error) {
        console.error('Save schedule times error:', error);
        await ctx.reply('❌ Ошибка при сохранении времени');
      }
    }

    if (ctx.session.waitingForScheduleInterval && ctx.session.editingChannelId) {
      const intervalText = ctx.message.text;
      const channelId = ctx.session.editingChannelId;

      delete ctx.session.waitingForScheduleInterval;
      delete ctx.session.editingChannelId;

      try {
        const interval = parseInt(intervalText);
        if (isNaN(interval) || interval < 10) {
          await ctx.reply('❌ Неверный интервал. Минимальный интервал - 10 минут');
          return;
        }

        const channel = await Channel.findById(channelId);
        channel.settings.schedule.interval = interval;
        await channel.save();

        await ctx.reply(`✅ Интервал обновлен: ${interval} минут`, {
          reply_markup: {
            inline_keyboard: [
              [{
                text: '🔙 К расписанию',
                callback_data: `schedule_settings_${channelId}`
              }]
            ]
          }
        });

      } catch (error) {
        console.error('Save schedule interval error:', error);
        await ctx.reply('❌ Ошибка при сохранении интервала');
      }
    }
  });
}

module.exports = setupChannelHandlers;