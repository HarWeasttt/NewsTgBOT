const { Scenes } = require('telegraf');
const { SUBSCRIPTION_PLANS } = require('../../config');

const editPlanScene = new Scenes.WizardScene(
  'edit-plan-scene',
  async (ctx) => {
    // Шаг 1: Выбор тарифа для редактирования
    const keyboard = Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => {
      return [{ text: `${plan.name} (${plan.price} зв.)`, callback_data: `edit_plan_${key}` }];
    });

    keyboard.push([{ text: '🔙 Отмена', callback_data: 'cancel_edit' }]);

    await ctx.reply('🎯 Выберите тариф для редактирования:', {
      reply_markup: { inline_keyboard: keyboard }
    });

    return ctx.wizard.next();
  },
  async (ctx) => {
    // Обработка выбора тарифа через callback
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'cancel_edit') {
        await ctx.reply('❌ Редактирование отменено.');
        return ctx.scene.leave();
      }

      const planKey = ctx.callbackQuery.data.replace('edit_plan_', '');
      ctx.wizard.state.planKey = planKey;
      ctx.wizard.state.originalPlan = { ...SUBSCRIPTION_PLANS[planKey] };

      const plan = SUBSCRIPTION_PLANS[planKey];
      
      const message = `✏️ Редактирование тарифа: *${plan.name}*

Текущие параметры:
• Название: ${plan.name}
• Каналов: ${plan.channels}
• Постов в день: ${plan.postsPerDay}
• AI-генерация: ${plan.aiAccess ? '✅' : '❌'}
• Цена: ${plan.price} звезд

Выберите параметр для изменения:`;

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✏️ Название', callback_data: 'edit_field_name' }],
            [{ text: '📺 Количество каналов', callback_data: 'edit_field_channels' }],
            [{ text: '📝 Постов в день', callback_data: 'edit_field_posts' }],
            [{ text: '🤖 AI-генерация', callback_data: 'edit_field_ai' }],
            [{ text: '💰 Цена', callback_data: 'edit_field_price' }],
            [{ text: '💾 Сохранить изменения', callback_data: 'save_changes' }],
            [{ text: '🔙 Отмена', callback_data: 'cancel_edit' }]
          ]
        }
      });

      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    // Шаг 3: Обработка выбора поля для редактирования
    if (ctx.callbackQuery) {
      const action = ctx.callbackQuery.data;

      if (action === 'cancel_edit') {
        await ctx.editMessageText('❌ Редактирование отменено.');
        return ctx.scene.leave();
      }

      if (action === 'save_changes') {
        // Сохранение изменений
        await savePlanChanges(ctx);
        return ctx.scene.leave();
      }

      // Определяем какое поле редактируем
      const fieldMap = {
        'edit_field_name': { field: 'name', prompt: 'Введите новое название тарифа:' },
        'edit_field_channels': { field: 'channels', prompt: 'Введите новое количество каналов (число):' },
        'edit_field_posts': { field: 'postsPerDay', prompt: 'Введите новое количество постов в день (число):' },
        'edit_field_ai': { field: 'aiAccess', prompt: 'Включить AI-генерацию? (да/нет):' },
        'edit_field_price': { field: 'price', prompt: 'Введите новую цену в звездах (число):' }
      };

      const fieldConfig = fieldMap[action];
      if (fieldConfig) {
        ctx.wizard.state.editingField = fieldConfig.field;
        await ctx.editMessageText(fieldConfig.prompt);
        return ctx.wizard.next();
      }
    }
  },
  async (ctx) => {
    // Шаг 4: Обработка введенного значения
    if (ctx.message && ctx.message.text) {
      const field = ctx.wizard.state.editingField;
      const value = ctx.message.text;
      const planKey = ctx.wizard.state.planKey;

      try {
        let parsedValue = value;

        // Парсим значение в зависимости от типа поля
        switch (field) {
          case 'channels':
          case 'postsPerDay':
          case 'price':
            parsedValue = parseInt(value);
            if (isNaN(parsedValue)) throw new Error('Неверное число');
            if (parsedValue < 0) throw new Error('Число не может быть отрицательным');
            break;
          
          case 'aiAccess':
            parsedValue = value.toLowerCase() === 'да' || value.toLowerCase() === 'yes' || value === '1';
            break;
          
          case 'name':
            if (value.length < 2 || value.length > 50) {
              throw new Error('Название должно быть от 2 до 50 символов');
            }
            break;
        }

        // Обновляем значение
        SUBSCRIPTION_PLANS[planKey][field] = parsedValue;
        
        await ctx.reply(`✅ Параметр "${field}" изменен на: ${parsedValue}`);

        // Показываем обновленные параметры
        const plan = SUBSCRIPTION_PLANS[planKey];
        const message = `📊 Обновленные параметры тарифа: *${plan.name}*

• Название: ${plan.name}
• Каналов: ${plan.channels}
• Постов в день: ${plan.postsPerDay}
• AI-генерация: ${plan.aiAccess ? '✅' : '❌'}
• Цена: ${plan.price} звезд

Выберите действие:`;

        await ctx.reply(message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Изменить другой параметр', callback_data: 'edit_another' }],
              [{ text: '💾 Сохранить изменения', callback_data: 'save_changes' }],
              [{ text: '🔙 Завершить', callback_data: 'finish_edit' }]
            ]
          }
        });

        return ctx.wizard.selectStep(2); // Возвращаемся к шагу выбора поля

      } catch (error) {
        await ctx.reply(`❌ Ошибка: ${error.message}\n\nПопробуйте еще раз:`);
        return; // Остаемся на том же шаге
      }
    }

    // Обработка callback действий
    if (ctx.callbackQuery) {
      const action = ctx.callbackQuery.data;

      if (action === 'finish_edit') {
        await savePlanChanges(ctx);
        return ctx.scene.leave();
      }

      if (action === 'edit_another') {
        const plan = SUBSCRIPTION_PLANS[ctx.wizard.state.planKey];
        
        const message = `✏️ Редактирование тарифа: *${plan.name}*

Выберите параметр для изменения:`;

        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✏️ Название', callback_data: 'edit_field_name' }],
              [{ text: '📺 Количество каналов', callback_data: 'edit_field_channels' }],
              [{ text: '📝 Постов в день', callback_data: 'edit_field_posts' }],
              [{ text: '🤖 AI-генерация', callback_data: 'edit_field_ai' }],
              [{ text: '💰 Цена', callback_data: 'edit_field_price' }],
              [{ text: '💾 Сохранить изменения', callback_data: 'save_changes' }],
              [{ text: '🔙 Завершить', callback_data: 'finish_edit' }]
            ]
          }
        });

        return ctx.wizard.selectStep(2);
      }

      if (action === 'save_changes') {
        await savePlanChanges(ctx);
        return ctx.scene.leave();
      }
    }
  }
);

// Функция сохранения изменений
async function savePlanChanges(ctx) {
  const planKey = ctx.wizard.state.planKey;
  const originalPlan = ctx.wizard.state.originalPlan;
  const newPlan = SUBSCRIPTION_PLANS[planKey];

  // Логируем изменения
  const changes = [];
  Object.keys(newPlan).forEach(key => {
    if (newPlan[key] !== originalPlan[key]) {
      changes.push(`${key}: ${originalPlan[key]} → ${newPlan[key]}`);
    }
  });

  if (changes.length > 0) {
    const message = `✅ Тариф "${newPlan.name}" успешно обновлен!\n\nИзменения:\n${changes.map(c => `• ${c}`).join('\n')}`;
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 К тарифам', callback_data: 'admin_back_to_plans' }],
          [{ text: '🛠 В админ-панель', callback_data: 'admin_back_to_panel' }]
        ]
      }
    });

    // Здесь можно добавить сохранение в базу данных или файл конфигурации
    console.log(`Plan ${planKey} updated:`, changes);
  } else {
    await ctx.reply('❌ Изменений не обнаружено.');
  }
}

module.exports = editPlanScene;