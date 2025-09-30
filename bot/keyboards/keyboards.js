const userMainKeyboard = {
  keyboard: [
    [{ text: '📊 Мои каналы' }, { text: '⚙️ Настройки' }],
    [{ text: '🤖 AI Генерация' }, { text: '📰 RSS Ленты' }],
    [{ text: '💎 Тарифы' }, { text: '🆘 Помощь' }]
  ],
  resize_keyboard: true
};

const adminMainKeyboard = {
  keyboard: [
    [{ text: '📊 Статистика' }, { text: '👥 Пользователи' }],
    [{ text: '💰 Финансы' }, { text: '🎯 Тарифы' }],
    [{ text: '🤖 AI Настройки' }, { text: '⚙️ Система' }],
    [{ text: '🔙 В главное меню' }]
  ],
  resize_keyboard: true
};

const channelManagementKeyboard = (channels) => {
  const buttons = channels.map(channel => 
    [{ text: `⚙️ ${channel.title}`, callback_data: `manage_channel_${channel._id}` }]
  );
  
  return {
    inline_keyboard: [
      ...buttons,
      [{ text: '➕ Добавить канал', callback_data: 'add_channel' }],
      [{ text: '🔙 Назад', callback_data: 'main_menu' }]
    ]
  };
};

const aiTonesKeyboard = {
  inline_keyboard: [
    [
      { text: '💼 Профессиональный', callback_data: 'ai_tone_professional' },
      { text: '😄 Юмористический', callback_data: 'ai_tone_humorous' }
    ],
    [
      { text: '📰 Новостной', callback_data: 'ai_tone_news' },
      { text: '🎯 Рекламный', callback_data: 'ai_tone_advertising' }
    ],
    [
      { text: '🎓 Образовательный', callback_data: 'ai_tone_educational' }
    ]
  ]
};

module.exports = {
  userMainKeyboard,
  adminMainKeyboard,
  channelManagementKeyboard,
  aiTonesKeyboard
};