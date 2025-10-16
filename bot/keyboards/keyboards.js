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
    [{ text: '📊 Каналы' }, { text: '🔙 В главное меню' }]
  ],
  resize_keyboard: true
};

const postTypesKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '📰 Новости', callback_data: 'post_type_news' },
        { text: '📝 Статья', callback_data: 'post_type_article' }
      ],
      [
        { text: '💡 Советы', callback_data: 'post_type_tips' },
        { text: '🎯 Реклама', callback_data: 'post_type_promotional' }
      ],
      [
        { text: '🎭 Развлечения', callback_data: 'post_type_entertainment' }
      ]
    ]
  }
};
// Инлайн-клавиатуры для callback обработчиков
const adminInlineKeyboard = {
  inline_keyboard: [
    [
      { text: '📊 Статистика', callback_data: 'admin_stats' },
      { text: '👥 Пользователи', callback_data: 'admin_users' }
    ],
    [
      { text: '💰 Финансы', callback_data: 'admin_finance' },
      { text: '🎯 Тарифы', callback_data: 'admin_plans' }
    ],
    [
      { text: '🤖 AI Настройки', callback_data: 'admin_ai_settings' },
      { text: '⚙️ Система', callback_data: 'admin_system' }
    ],
    [
      { text: '📊 Каналы', callback_data: 'admin_manage_channels' }
    ]
  ]
};

const channelManagementKeyboard = (channels) => {
  const buttons = channels.map(channel => [
    { 
      text: `⚙️ ${channel.title.substring(0, 20)}`, 
      callback_data: `channel_detail_${channel._id}` 
    },
    { 
      text: '🗑️', 
      callback_data: `delete_channel_${channel._id}` 
    }
  ]);
  
  return {
    inline_keyboard: [
      ...buttons,
      [{ text: '➕ Добавить канал', callback_data: 'add_channel' }],
      [{ text: '🔙 Назад', callback_data: 'main_menu' }]
    ]
  };
};

const channelDetailKeyboard = (channelId) => ({
  inline_keyboard: [
    [
      { text: '📰 RSS', callback_data: `manage_rss_${channelId}` },
      { text: '🤖 AI', callback_data: `ai_settings_${channelId}` }
    ],
    [
      { text: '🚀 Создать пост', callback_data: `ai_generate_${channelId}` },
      { text: '⚙️ Настройки', callback_data: `channel_settings_${channelId}` }
    ],
    [
      { text: '🗑️ Удалить канал', callback_data: `delete_channel_${channelId}` }
    ],
    [
      { text: '🔙 Назад', callback_data: 'manage_channels' }
    ]
  ]
});

const deleteConfirmKeyboard = (channelId) => ({
  inline_keyboard: [
    [
      { text: '✅ Да, удалить', callback_data: `confirm_delete_channel_${channelId}` },
      { text: '❌ Отмена', callback_data: `channel_detail_${channelId}` }
    ]
  ]
});

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

// Клавиатура для управления RSS
const rssManagementKeyboard = (channelId, hasRssSources = false) => {
  const keyboard = [
    [{ text: '➕ Добавить RSS', callback_data: `rss_setup_${channelId}` }]
  ];
  
  if (hasRssSources) {
    keyboard.push([{ text: '🗑️ Удалить RSS', callback_data: `delete_rss_${channelId}` }]);
  }
  
  keyboard.push([{ text: '🔙 Назад', callback_data: `channel_detail_${channelId}` }]);
  
  return { inline_keyboard: keyboard };
};

// Клавиатура для выбора RSS источников для удаления
const rssDeleteSelectionKeyboard = (channel, channelId) => {
  const buttons = channel.rssSources.map((source, index) => {
    const shortUrl = source.url.length > 30 ? source.url.substring(0, 30) + '...' : source.url;
    return [{
      text: `${index + 1}. ${shortUrl}`,
      callback_data: `confirm_delete_rss_${channelId}_${index}`
    }];
  });
  
  buttons.push([{ text: '🔙 Назад', callback_data: `manage_rss_${channelId}` }]);
  
  return { inline_keyboard: buttons };
};

module.exports = {
  userMainKeyboard,
  adminMainKeyboard,
  adminInlineKeyboard,
  postTypesKeyboard,
  channelManagementKeyboard,
  channelDetailKeyboard,
  deleteConfirmKeyboard,
  aiTonesKeyboard,
  rssManagementKeyboard,
  rssDeleteSelectionKeyboard
};