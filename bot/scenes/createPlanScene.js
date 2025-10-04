const { Scenes } = require('telegraf');
const { SUBSCRIPTION_PLANS } = require('../../config');
const fs = require('fs');
const path = require('path');

const createPlanScene = new Scenes.WizardScene(
  'create-plan-scene',
  async (ctx) => {
    // Шаг 1: Ввод названия тарифа
    await ctx.reply('🆕 Создание нового тарифа\n\nВведите название для нового тарифа:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Отмена', callback_data: 'cancel_create_plan' }]
        ]
      }
    });
    return ctx.wizard.next();
  },
  async (ctx) => {
    // Шаг 2: Обработка названия тарифа
    if (ctx.message && ctx.message.text) {
      const planName = ctx.message.text.trim();
      
      if (planName.length < 2 || planName.length > 30) {
        await ctx.reply('❌ Название должно быть от 2 до 30 символов. Попробуйте еще раз:');
        return;
      }

      // Проверяем, нет ли тарифа с таким названием
      const existingPlan = Object.values(SUBSCRIPTION_PLANS).find(plan => 
        plan.name.toLowerCase() === planName.toLowerCase()
      );

      if (existingPlan) {
        await ctx.reply(`❌ Тариф с названием "${planName}" уже существует. Введите другое название:`);
        return;
      }

      ctx.wizard.state.newPlan = {
        name: planName,
        key: `CUSTOM_${Date.now()}`.toUpperCase()
      };

      await ctx.reply(`✅ Название: "${planName}"\n\nТеперь введите количество каналов (число):`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'cancel_create_plan' }]
          ]
        }
      });
      return ctx.wizard.next();
    }

    if (ctx.callbackQuery && ctx.callbackQuery.data === 'cancel_create_plan') {
      await ctx.reply('❌ Создание тарифа отменено.');
      return ctx.scene.leave();
    }
  },
  async (ctx) => {
    // Шаг 3: Ввод количества каналов
    if (ctx.message && ctx.message.text) {
      const channels = parseInt(ctx.message.text);
      
      if (isNaN(channels) || channels < 1 || channels > 100) {
        await ctx.reply('❌ Количество каналов должно быть числом от 1 до 100. Попробуйте еще раз:');
        return;
      }

      ctx.wizard.state.newPlan.channels = channels;

      await ctx.reply(`✅ Каналов: ${channels}\n\nТеперь введите количество постов в день (число):`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'cancel_create_plan' }]
          ]
        }
      });
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    // Шаг 4: Ввод количества постов в день
    if (ctx.message && ctx.message.text) {
      const postsPerDay = parseInt(ctx.message.text);
      
      if (isNaN(postsPerDay) || postsPerDay < 1 || postsPerDay > 100) {
        await ctx.reply('❌ Количество постов должно быть числом от 1 до 100. Попробуйте еще раз:');
        return;
      }

      ctx.wizard.state.newPlan.postsPerDay = postsPerDay;

      await ctx.reply(`✅ Постов в день: ${postsPerDay}\n\nВключить AI-генерацию? (да/нет):`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Да', callback_data: 'ai_yes' },
              { text: '❌ Нет', callback_data: 'ai_no' }
            ],
            [{ text: '❌ Отмена', callback_data: 'cancel_create_plan' }]
          ]
        }
      });
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    // Шаг 5: Выбор AI-генерации
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'cancel_create_plan') {
        await ctx.reply('❌ Создание тарифа отменено.');
        return ctx.scene.leave();
      }

      if (ctx.callbackQuery.data === 'ai_yes' || ctx.callbackQuery.data === 'ai_no') {
        ctx.wizard.state.newPlan.aiAccess = ctx.callbackQuery.data === 'ai_yes';

        await ctx.editMessageText(`✅ AI-генерация: ${ctx.wizard.state.newPlan.aiAccess ? 'включена' : 'выключена'}\n\nТеперь введите цену в звездах (0 для бесплатного тарифа):`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Отмена', callback_data: 'cancel_create_plan' }]
            ]
          }
        });
        return ctx.wizard.next();
      }
    }

    if (ctx.message && ctx.message.text) {
      const aiAnswer = ctx.message.text.toLowerCase();
      if (aiAnswer === 'да' || aiAnswer === 'yes') {
        ctx.wizard.state.newPlan.aiAccess = true;
      } else if (aiAnswer === 'нет' || aiAnswer === 'no') {
        ctx.wizard.state.newPlan.aiAccess = false;
      } else {
        await ctx.reply('❌ Пожалуйста, ответьте "да" или "нет". Включить AI-генерацию?');
        return;
      }

      await ctx.reply(`✅ AI-генерация: ${ctx.wizard.state.newPlan.aiAccess ? 'включена' : 'выключена'}\n\nТеперь введите цену в звездах (0 для бесплатного тарифа):`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '❌ Отмена', callback_data: 'cancel_create_plan' }]
          ]
        }
      });
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    // Шаг 6: Ввод цены и подтверждение
    if (ctx.message && ctx.message.text) {
      const price = parseInt(ctx.message.text);
      
      if (isNaN(price) || price < 0 || price > 100000) {
        await ctx.reply('❌ Цена должна быть числом от 0 до 100000. Попробуйте еще раз:');
        return;
      }

      ctx.wizard.state.newPlan.price = price;

      // Показываем сводку и запрашиваем подтверждение
      const plan = ctx.wizard.state.newPlan;
      const message = `📋 Сводка нового тарифа:\n\n` +
        `🔸 Название: ${plan.name}\n` +
        `📺 Каналов: ${plan.channels}\n` +
        `📝 Постов в день: ${plan.postsPerDay}\n` +
        `🤖 AI-генерация: ${plan.aiAccess ? '✅' : '❌'}\n` +
        `💰 Цена: ${plan.price > 0 ? `${plan.price} звезд` : 'Бесплатно'}\n\n` +
        `Создать этот тариф?`;

      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Создать', callback_data: 'confirm_create_plan' },
              { text: '❌ Отмена', callback_data: 'cancel_create_plan' }
            ]
          ]
        }
      });
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    // Шаг 7: Подтверждение и создание тарифа
    if (ctx.callbackQuery) {
      if (ctx.callbackQuery.data === 'cancel_create_plan') {
        await ctx.editMessageText('❌ Создание тарифа отменено.');
        return ctx.scene.leave();
      }

      if (ctx.callbackQuery.data === 'confirm_create_plan') {
        await ctx.editMessageText('🔄 Создание тарифа...');

        try {
          const newPlan = ctx.wizard.state.newPlan;
          
          // Добавляем тариф в конфигурацию
          SUBSCRIPTION_PLANS[newPlan.key] = newPlan;

          // Сохраняем в файл
          await saveCustomPlan(newPlan);

          const message = `✅ Тариф "${newPlan.name}" успешно создан!\n\n` +
            `📊 Параметры:\n` +
            `• Каналов: ${newPlan.channels}\n` +
            `• Постов в день: ${newPlan.postsPerDay}\n` +
            `• AI-генерация: ${newPlan.aiAccess ? '✅' : '❌'}\n` +
            `• Цена: ${newPlan.price > 0 ? `${newPlan.price} звезд` : 'Бесплатно'}\n\n` +
            `Тариф теперь доступен для назначения пользователям.`;

          await ctx.reply(message, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🎯 К тарифам', callback_data: 'admin_back_to_plans' },
                  { text: '🛠 В админ-панель', callback_data: 'admin_back_to_panel' }
                ]
              ]
            }
          });

        } catch (error) {
          console.error('Create plan error:', error);
          await ctx.editMessageText('❌ Ошибка при создании тарифа. Попробуйте позже.');
        }

        return ctx.scene.leave();
      }
    }
  }
);

// Функция сохранения кастомного тарифа
async function saveCustomPlan(plan) {
  try {
    const customPlansPath = path.join(__dirname, '../../config/custom_plans.json');
    let customPlans = {};

    // Загружаем существующие кастомные тарифы
    if (fs.existsSync(customPlansPath)) {
      const data = fs.readFileSync(customPlansPath, 'utf8');
      customPlans = JSON.parse(data);
    }

    // Добавляем новый тариф
    customPlans[plan.key] = plan;

    // Сохраняем обратно
    fs.writeFileSync(customPlansPath, JSON.stringify(customPlans, null, 2));
    
    console.log(`✅ Custom plan saved: ${plan.name}`);
    return true;
  } catch (error) {
    console.error('Error saving custom plan:', error);
    throw error;
  }
}

module.exports = createPlanScene;