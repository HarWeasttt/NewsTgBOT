const { Markup } = require('telegraf');

const Keyboards = {
  // Главное меню для пользователей
  mainMenu: () => 
    Markup.keyboard([
      ['📊 Мой кабинет', 'ℹ️ Помощь'],
      ['💳 Тарифы', '👨‍💻 Поддержка']
    ]).resize(),

  // Меню администратора
  adminMenu: () =>
    Markup.keyboard([
      ['📈 Статистика', '👥 Пользователи'],
      ['⚙️ Тарифы', '📢 Рассылка'],
      ['🔙 Главное меню']
    ]).resize(),

  // Меню управления тарифами для админов
  adminTariffsMenu: () =>
    Markup.keyboard([
      ['➕ Создать тариф', '📋 Список тарифов'],
      ['🔙 Админ-панель']
    ]).resize(),

  // Личный кабинет пользователя
  userCabinet: () =>
    Markup.keyboard([
      ['📺 Мои каналы', '🔍 Мои промты'],
      ['⏰ Расписание', '💎 Мой тариф'],
      ['🔙 Главное меню']
    ]).resize(),

  // Управление каналами
  channelsManagement: () =>
    Markup.keyboard([
      ['➕ Добавить канал', '🗑️ Удалить канал'],
      ['📋 Список каналов', '🔙 Мой кабинет']
    ]).resize(),

  // Управление промтами
  promptsManagement: () =>
    Markup.keyboard([
      ['➕ Добавить промт', '🗑️ Удалить промт'],
      ['📋 Список промтов', '🔙 Мой кабинет']
    ]).resize(),

  // Меню тарифов для покупки
  tariffsMenu: () =>
    Markup.keyboard([
      ['💫 Купить Basic', '💫 Купить Advanced'],
      ['💫 Купить Professional', '🔙 Главное меню']
    ]).resize(),

  // Кнопка для оплаты через Stars (inline)
  paymentButton: (planCode, starsAmount) =>
    Markup.inlineKeyboard([
      Markup.button.callback(`💫 Оплатить ${starsAmount} звезд`, `pay_${planCode}`)
    ]),

  // Навигационные кнопки
  backToCabinet: () =>
    Markup.keyboard([['🔙 Мой кабинет']]).resize(),

  backToMain: () =>
    Markup.keyboard([['🔙 Главное меню']]).resize(),

  backToAdmin: () =>
    Markup.keyboard([['🔙 Админ-панель']]).resize(),

  backToTariffs: () =>
    Markup.keyboard([['🔙 Управление тарифами']]).resize(),

  // Кнопка отмены действия
  cancelAction: () =>
    Markup.keyboard([['❌ Отмена']]).resize(),

  // Старые функции для совместимости (можно удалить если не используются)
  subscriptionPlans: (plans) => {
    const buttons = plans.map(plan => [`${plan.name} - ${plan.price} руб/мес`]);
    buttons.push(['🔙 Главное меню']);
    return Markup.keyboard(buttons).resize();
  },

  inlineSubscribe: (planId) =>
    Markup.inlineKeyboard([
      Markup.button.callback('💳 Оплатить подписку', `subscribe_${planId}`)
    ]),

  inlineChannelActions: (channelId) =>
    Markup.inlineKeyboard([
      Markup.button.callback('⚙️ Настройки', `channel_settings_${channelId}`),
      Markup.button.callback('🗑️ Удалить', `channel_delete_${channelId}`)
    ]),

  // Дополнительные inline кнопки для лучшего UX
  inlineTariffActions: (tariffId) =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✏️ Редактировать', `edit_tariff_${tariffId}`),
        Markup.button.callback('🔄 Вкл/Выкл', `toggle_tariff_${tariffId}`)
      ],
      [
        Markup.button.callback('🗑️ Удалить', `delete_tariff_${tariffId}`)
      ]
    ]),

  inlineUserActions: (userId) =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback('💎 Изменить тариф', `change_user_plan_${userId}`),
        Markup.button.callback('📅 Продлить', `extend_sub_${userId}`)
      ]
    ]),

  // Кнопки для подтверждения действий
  confirmAction: () =>
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Подтвердить', 'confirm_action'),
        Markup.button.callback('❌ Отменить', 'cancel_action')
      ]
    ]),

  // Кнопки для выбора тарифов (для админов при изменении пользователю)
  tariffSelection: (plans) => {
    const buttons = plans.map(plan => 
      [Markup.button.callback(plan.name, `select_plan_${plan._id}`)]
    );
    buttons.push([Markup.button.callback('🔙 Назад', 'back_to_users')]);
    return Markup.inlineKeyboard(buttons);
  }
};

module.exports = Keyboards;