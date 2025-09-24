const { Markup } = require('telegraf');

const Keyboards = {
  mainMenu: () => 
    Markup.keyboard([
      ['📊 Мой кабинет', 'ℹ️ Помощь'],
      ['💳 Тарифы', '👨‍💻 Поддержка']
    ]).resize(),

  adminMenu: () =>
    Markup.keyboard([
      ['📈 Статистика', '👥 Пользователи'],
      ['⚙️ Тарифы', '📢 Рассылка'],
      ['🔙 Главное меню']
    ]).resize(),

  userCabinet: () =>
    Markup.keyboard([
      ['📺 Мои каналы', '🔍 Мои промты'],
      ['⏰ Расписание', '💎 Мой тариф'],
      ['🔙 Главное меню']
    ]).resize(),

  channelsManagement: () =>
    Markup.keyboard([
      ['➕ Добавить канал', '🗑️ Удалить канал'],
      ['📋 Список каналов', '🔙 Мой кабинет']
    ]).resize(),

  promptsManagement: () =>
    Markup.keyboard([
      ['➕ Добавить промт', '🗑️ Удалить промт'],
      ['📋 Список промтов', '🔙 Мой кабинет']
    ]).resize(),

  backToCabinet: () =>
    Markup.keyboard([['🔙 Мой кабинет']]).resize(),

  backToMain: () =>
    Markup.keyboard([['🔙 Главное меню']]).resize(),

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

  cancelAction: () =>
    Markup.keyboard([['❌ Отмена']]).resize()
};

module.exports = Keyboards;