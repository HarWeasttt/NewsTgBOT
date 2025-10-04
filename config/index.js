require('dotenv').config();
const fs = require('fs');
const path = require('path');

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

// Загрузка кастомных тарифов
function loadCustomPlans() {
  try {
    const customPlansPath = path.join(__dirname, 'custom_plans.json');
    if (fs.existsSync(customPlansPath)) {
      const customPlansData = fs.readFileSync(customPlansPath, 'utf8');
      const customPlans = JSON.parse(customPlansData);
      
      // Добавляем кастомные тарифы в основной объект
      Object.assign(SUBSCRIPTION_PLANS, customPlans);
      console.log(`✅ Загружено ${Object.keys(customPlans).length} кастомных тарифов`);
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки кастомных тарифов:', error);
  }
}

// Загружаем кастомные тарифы при старте
loadCustomPlans();

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
  AI_TONES,
  loadCustomPlans // Экспортируем для перезагрузки
};