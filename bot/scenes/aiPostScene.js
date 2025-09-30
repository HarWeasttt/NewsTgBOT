const { Scenes } = require('telegraf');
const AIService = require('../../services/AIService');
const PostQueue = require('../../queues/PostQueue');
const UserService = require('../../services/UserService');

const aiPostScene = new Scenes.WizardScene(
  'ai-post-scene',
  // Шаг 1: Выбор стиля
  async (ctx) => {
    try {
      // Получаем пользователя из базы
      const user = await UserService.getOrCreateUser(ctx.from);
      ctx.scene.state.user = user; // Сохраняем пользователя в состоянии сцены
      // channelId уже должен быть передан при входе в сцену

      await ctx.reply('🎯 Выберите стиль поста:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💼 Проф', callback_data: 'professional' },
              { text: '😄 Юмор', callback_data: 'humorous' },
              { text: '📰 Новости', callback_data: 'news' }
            ],
            [
              { text: '🎯 Реклама', callback_data: 'advertising' },
              { text: '🎓 Образование', callback_data: 'educational' }
            ],
            [
              { text: '❌ Отмена', callback_data: 'cancel' }
            ]
          ]
        }
      });
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in aiPostScene step 1:', error);
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
      return ctx.scene.leave();
    }
  },

  // Шаг 2: Обработка выбора стиля
  async (ctx) => {
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'cancel') {
        await ctx.reply('❌ Создание поста отменено.');
        return ctx.scene.leave();
      }

      ctx.scene.state.tone = ctx.callbackQuery.data;
      const toneNames = {
        professional: '💼 Профессиональный',
        humorous: '😄 Юмористический',
        news: '📰 Новостной',
        advertising: '🎯 Рекламный',
        educational: '🎓 Образовательный'
      };

      await ctx.editMessageText(`Выбран стиль: ${toneNames[ctx.scene.state.tone]}\n\nТеперь введите тему поста:`);
      return ctx.wizard.next();
    } else {
      await ctx.reply('❌ Пожалуйста, выберите стиль из кнопок');
      return;
    }
  },

  // Шаг 3: Ввод темы и генерация поста
  async (ctx) => {
    if (!ctx.message || !ctx.message.text) {
      await ctx.reply('❌ Пожалуйста, введите тему поста');
      return;
    }

    // Отмена по команде
    if (ctx.message.text.toLowerCase() === 'отмена' || ctx.message.text.toLowerCase() === 'cancel') {
      await ctx.reply('❌ Создание поста отменено.');
      return ctx.scene.leave();
    }

    ctx.scene.state.topic = ctx.message.text;

    await ctx.reply('📝 Генерирую пост... Это может занять несколько секунд.');

    try {
      const postContent = await AIService.generatePost(
        ctx.scene.state.topic,
        ctx.scene.state.tone
      );

      ctx.scene.state.postContent = postContent;

      await ctx.reply(`✅ Сгенерированный пост:\n\n${postContent}\n\nЧто делаем дальше?`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚀 Опубликовать сейчас', callback_data: 'publish_now' },
              { text: '⏰ Запланировать', callback_data: 'schedule' }
            ],
            [
              { text: '📝 Редактировать', callback_data: 'edit' },
              { text: '❌ Отмена', callback_data: 'cancel' }
            ]
          ]
        }
      });

      return ctx.wizard.next();
    } catch (error) {
      console.error('AI generation error:', error);
      await ctx.reply('❌ Ошибка при генерации поста. Попробуйте позже.');
      return ctx.scene.leave();
    }
  },

  // Шаг 4: Выбор действия с постом
  async (ctx) => {
    if (!ctx.callbackQuery) {
      await ctx.reply('❌ Пожалуйста, выберите действие из кнопок');
      return;
    }

    const action = ctx.callbackQuery.data;

    switch (action) {
      case 'publish_now':
        try {
          // Получаем канал и пользователя
          const Channel = require('../../models/Channel');
          const channel = await Channel.findById(ctx.scene.state.channelId);

          if (!channel) {
            await ctx.reply('❌ Канал не найден.');
            return ctx.scene.leave();
          }

          // Проверяем лимиты пользователя
          const user = ctx.scene.state.user;
          const canPost = await UserService.canUserPost(user);

          if (!canPost) {
            await ctx.reply('❌ Вы достигли дневного лимита постов.');
            return ctx.scene.leave();
          }

          // Публикация сразу
          const job = await PostQueue.add({
            channelId: channel.telegramId,
            content: ctx.scene.state.postContent,
            userId: user._id.toString()
          });

          await UserService.incrementPostCount(user);

          await ctx.reply('✅ Пост добавлен в очередь публикации!');
          return ctx.scene.leave();
        } catch (error) {
          console.error('Publish error:', error);
          await ctx.reply('❌ Ошибка при публикации поста: ' + error.message);
          return ctx.scene.leave();
        }

      case 'schedule':
        try {
          const Channel = require('../../models/Channel');
          const channel = await Channel.findById(ctx.scene.state.channelId);

          if (!channel) {
            await ctx.reply('❌ Канал не найден.');
            return ctx.scene.leave();
          }

          await ctx.reply('⏰ Введите время публикации в формате ЧЧ:ММ (например, 14:30):');
          ctx.scene.state.waitingForTime = true;
          ctx.scene.state.channel = channel;
          return ctx.wizard.next(); // Переходим к шагу планирования
        } catch (error) {
          console.error('Schedule setup error:', error);
          await ctx.reply('❌ Ошибка при настройке планирования.');
          return ctx.scene.leave();
        }

      case 'edit':
        await ctx.reply('✏️ Отправьте отредактированный текст поста:');
        ctx.scene.state.waitingForEdit = true;
        return ctx.wizard.next(); // Переходим к шагу редактирования

      case 'cancel':
        await ctx.reply('❌ Создание поста отменено');
        return ctx.scene.leave();

      default:
        await ctx.reply('❌ Неизвестное действие');
        return ctx.scene.leave();
    }
  },

  // Шаг 5: Обработка планирования или редактирования
  async (ctx) => {
    // Обработка планирования
    if (ctx.scene.state.waitingForTime) {
      if (!ctx.message || !ctx.message.text) {
        await ctx.reply('❌ Пожалуйста, введите время');
        return;
      }

      const timeMatch = ctx.message.text.match(/^(\d{1,2}):(\d{2})$/);
      if (!timeMatch) {
        await ctx.reply('❌ Неверный формат времени. Используйте ЧЧ:ММ (например, 14:30)');
        return;
      }

      const [_, hours, minutes] = timeMatch;
      const publishAt = new Date();
      publishAt.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      if (publishAt < new Date()) {
        publishAt.setDate(publishAt.getDate() + 1);
        await ctx.reply('⏰ Время уже прошло, планирую на завтра.');
      }

      try {
        const user = ctx.scene.state.user;
        const channel = ctx.scene.state.channel;

        const job = await PostQueue.schedulePost(
          channel.telegramId,
          ctx.scene.state.postContent,
          publishAt,
          user._id.toString()
        );

        await ctx.reply(`✅ Пост запланирован на ${publishAt.toLocaleString('ru-RU')}\n\nID задачи: ${job.id}`);
        return ctx.scene.leave();

      } catch (error) {
        console.error('Schedule error:', error);
        await ctx.reply('❌ Ошибка при планировании поста: ' + error.message);
        return ctx.scene.leave();
      }
    }

    // Обработка редактирования
    else if (ctx.scene.state.waitingForEdit) {
      if (!ctx.message || !ctx.message.text) {
        await ctx.reply('❌ Пожалуйста, введите текст');
        return;
      }

      ctx.scene.state.postContent = ctx.message.text;
      
      // Показываем обновленный пост и снова предлагаем действия
      await ctx.reply(`✅ Текст обновлен!\n\nОбновленный пост:\n\n${ctx.scene.state.postContent}\n\nЧто делаем дальше?`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚀 Опубликовать сейчас', callback_data: 'publish_now' },
              { text: '⏰ Запланировать', callback_data: 'schedule' }
            ],
            [
              { text: '📝 Редактировать', callback_data: 'edit' },
              { text: '✅ Завершить', callback_data: 'finish' }
            ]
          ]
        }
      });
      
      // Возвращаемся к шагу выбора действия
      ctx.scene.state.waitingForEdit = false;
      return ctx.wizard.back();
    }

    // Если ни одно условие не выполнилось
    await ctx.reply('❌ Произошла ошибка. Попробуйте заново.');
    return ctx.scene.leave();
  }
);

// Обработчики для inline кнопок внутри сцены
aiPostScene.action('finish', async (ctx) => {
  await ctx.reply('✅ Создание поста завершено.');
  return ctx.scene.leave();
});

aiPostScene.action('publish_now', async (ctx) => {
  // Этот обработчик будет работать когда мы вернулись к шагу выбора действия после редактирования
  try {
    const Channel = require('../../models/Channel');
    const channel = await Channel.findById(ctx.scene.state.channelId);

    if (!channel) {
      await ctx.reply('❌ Канал не найден.');
      return ctx.scene.leave();
    }

    const user = ctx.scene.state.user;
    const canPost = await UserService.canUserPost(user);

    if (!canPost) {
      await ctx.reply('❌ Вы достигли дневного лимита постов.');
      return ctx.scene.leave();
    }

    const job = await PostQueue.add({
      channelId: channel.telegramId,
      content: ctx.scene.state.postContent,
      userId: user._id.toString()
    });

    await UserService.incrementPostCount(user);
    await ctx.reply('✅ Пост добавлен в очередь публикации!');
    return ctx.scene.leave();

  } catch (error) {
    console.error('Publish error:', error);
    await ctx.reply('❌ Ошибка при публикации поста: ' + error.message);
    return ctx.scene.leave();
  }
});

aiPostScene.action('schedule', async (ctx) => {
  // Этот обработчик будет работать когда мы вернулись к шагу выбора действия после редактирования
  try {
    const Channel = require('../../models/Channel');
    const channel = await Channel.findById(ctx.scene.state.channelId);

    if (!channel) {
      await ctx.reply('❌ Канал не найден.');
      return ctx.scene.leave();
    }

    await ctx.reply('⏰ Введите время публикации в формате ЧЧ:ММ (например, 14:30):');
    ctx.scene.state.waitingForTime = true;
    ctx.scene.state.channel = channel;
    return ctx.wizard.next();

  } catch (error) {
    console.error('Schedule setup error:', error);
    await ctx.reply('❌ Ошибка при настройке планирования.');
    return ctx.scene.leave();
  }
});

aiPostScene.action('edit', async (ctx) => {
  // Этот обработчик будет работать когда мы вернулись к шагу выбора действия после редактирования
  await ctx.reply('✏️ Отправьте отредактированный текст поста:');
  ctx.scene.state.waitingForEdit = true;
  return ctx.wizard.next();
});

module.exports = aiPostScene;