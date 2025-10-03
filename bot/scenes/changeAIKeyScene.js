const { Scenes } = require('telegraf');
const ConfigService = require('../../services/ConfigService');
const AIService = require('../../services/AIService');

const changeAIKeyScene = new Scenes.WizardScene(
  'change-ai-key-scene',
  async (ctx) => {
    // Шаг 1: Показываем текущий ключ и запрашиваем новый
    const currentKey = ConfigService.getCurrentAIKey();
    
    let message = '🔧 Изменение API ключа OpenAI\n\n';
    
    if (currentKey) {
      message += `📋 Текущий ключ: ${currentKey}\n\n`;
    } else {
      message += `⚠️ API ключ в настоящее время не установлен\n\n`;
    }

    message += `Для изменения API ключа:\n`;
    message += `1. Получите новый ключ на platform.openai.com\n`;
    message += `2. Введите ключ в формате: sk-...\n`;
    message += `3. Ключ будет проверен на валидность\n\n`;
    message += `Введите новый API ключ OpenAI:`;

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Отмена', callback_data: 'cancel_key_change' }]
        ]
      }
    });

    return ctx.wizard.next();
  },
  async (ctx) => {
    // Шаг 2: Обработка введенного ключа
    if (ctx.message && ctx.message.text) {
      const newApiKey = ctx.message.text.trim();
      
      // Проверяем валидность ключа
      const validation = await ConfigService.validateAIKey(newApiKey);
      
      if (!validation.valid) {
        await ctx.reply(`❌ ${validation.error}\n\nПожалуйста, введите корректный API ключ:`);
        return; // Остаемся на том же шаге
      }

      // Сохраняем preview ключей для истории
      const currentKeyPreview = ConfigService.getCurrentAIKey();
      const newKeyPreview = `${newApiKey.substring(0, 4)}...${newApiKey.substring(newApiKey.length - 4)}`;
      
      ctx.wizard.state.newApiKey = newApiKey;
      ctx.wizard.state.currentKeyPreview = currentKeyPreview;
      ctx.wizard.state.newKeyPreview = newKeyPreview;

      // Подтверждение изменения
      await ctx.reply(`✅ Ключ прошел базовую проверку\n\nПодтвердите изменение API ключа:\n\nСтарый ключ: ${currentKeyPreview || 'не установлен'}\nНовый ключ: ${newKeyPreview}\n\nВы уверены, что хотите продолжить?`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Да, изменить', callback_data: 'confirm_key_change' },
              { text: '❌ Отмена', callback_data: 'cancel_key_change' }
            ]
          ]
        }
      });

      return ctx.wizard.next();
    }

    // Обработка callback от кнопки отмены
    if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_key_change') {
      await ctx.reply('❌ Изменение API ключа отменено.');
      return ctx.scene.leave();
    }
  },
  async (ctx) => {
    // Шаг 3: Подтверждение и применение изменений
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'cancel_key_change') {
        await ctx.editMessageText('❌ Изменение API ключа отменено.');
        return ctx.scene.leave();
      }

      if (ctx.callbackQuery.data === 'confirm_key_change') {
        await ctx.editMessageText('🔄 Применение изменений...');

        try {
          // Обновляем ключ в .env файле
          const result = await ConfigService.updateAIKey(ctx.wizard.state.newApiKey);

          if (result.success) {
            // Сохраняем в историю
            await ConfigService.saveKeyChangeHistory(
              ctx.wizard.state.currentKeyPreview,
              ctx.wizard.state.newKeyPreview,
              ctx.from.id
            );

            // Переинициализируем AI сервис с новым ключом
            // Note: В реальном приложении может потребоваться перезапуск
            AIService.openai = null; // Сбрасываем инстанс

            await ctx.reply(`✅ API ключ успешно обновлен!\n\n📋 Новый ключ: ${ctx.wizard.state.newKeyPreview}\n\nИзменения применены. AI сервис будет использовать новый ключ для следующих запросов.`, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔙 В админ-панель', callback_data: 'admin_back_to_panel' }]
                ]
              }
            });

          } else {
            await ctx.reply(`❌ ${result.error}\n\nПожалуйста, проверьте права доступа к файлу .env.`);
          }

        } catch (error) {
          await ctx.reply(`❌ Ошибка при обновлении ключа: ${error.message}`);
        }

        return ctx.scene.leave();
      }
    }
  }
);

module.exports = changeAIKeyScene;