require('dotenv').config();

const BOT_CONFIG = {
  TOKEN: process.env.BOT_TOKEN || '',
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id)) : [],
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/telegram_content_bot',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
};

const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Бесплатный',
    channels: 1,
    postsPerDay: 1,
    aiAccess: false,
    price: 0
  },
  START: {
    name: 'Старт',
    channels: 1,
    postsPerDay: 2,
    aiAccess: true,
    price: 299
  },
  PRO: {
    name: 'Профи',
    channels: 3,
    postsPerDay: 9,
    aiAccess: true,
    price: 799
  },
  AGENCY: {
    name: 'Агентство',
    channels: 20,
    postsPerDay: 50,
    aiAccess: true,
    price: 2999
  }
};

const AI_TONES = {
  professional: 'Профессиональный',
  humorous: 'Юмористический',
  news: 'Новостной',
  advertising: 'Рекламный',
  educational: 'Образовательный'
};

module.exports = {
  BOT_CONFIG,
  SUBSCRIPTION_PLANS,
  AI_TONES
};