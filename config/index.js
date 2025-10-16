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
const POST_TYPES = {
  news: {
    name: '📰 Новостной пост',
    description: 'Актуальные новости и события',
    examples: [
      'Запуск нового продукта компании X',
      'Итоги квартальных отчетов',
      'Важные изменения в законодательстве'
    ]
  },
  article: {
    name: '📝 Статья',
    description: 'Подробный аналитический материал',
    examples: [
      'Анализ рынка криптовалют в 2024 году',
      'Тенденции развития искусственного интеллекта',
      'Обзор новых технологий в медицине'
    ]
  },
  tips: {
    name: '💡 Советы и рекомендации',
    description: 'Полезные советы и лайфхаки',
    examples: [
      '5 способов повысить продуктивность',
      'Как правильно инвестировать начинающим',
      'Советы по улучшению качества сна'
    ]
  },
  promotional: {
    name: '🎯 Рекламный пост',
    description: 'Посты для продвижения товаров и услуг',
    examples: [
      'Специальное предложение для новых клиентов',
      'Анонс вебинара по цифровому маркетингу',
      'Распродажа сезонных товаров'
    ]
  },
  entertainment: {
    name: '🎭 Развлекательный контент',
    description: 'Юмористические и развлекательные посты',
    examples: [
      'Смешные случаи из офисной жизни',
      'Интересные факты о животных',
      'Викторина на знание фильмов'
    ]
  }
};

const AI_PROMPTS = {
  news: 'Напиши новостной пост на тему: {topic}. Стиль: {tone}. Сделай текст информативным и engaging.',
  article: 'Напиши развернутую статью на тему: {topic}. Стиль: {tone}. Добавь аналитику и примеры.',
  tips: 'Создай пост с советами на тему: {topic}. Стиль: {tone}. Сделай практично и полезно.',
  promotional: 'Создай рекламный пост на тему: {topic}. Стиль: {tone}. Сделай убедительно но ненавязчиво.',
  entertainment: 'Создай развлекательный пост на тему: {topic}. Стиль: {tone}. Сделай весело и интересно.'
};
module.exports = {
  BOT_CONFIG,
  SUBSCRIPTION_PLANS,
  AI_TONES,AI_PROMPTS, POST_TYPES,
  loadCustomPlans // Экспортируем для перезагрузки
};