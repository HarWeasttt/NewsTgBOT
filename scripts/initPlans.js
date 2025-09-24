require('dotenv').config();
const mongoose = require('mongoose');
const { SubscriptionPlan } = require('../src/models');
const config = require('../config');

const defaultPlans = [
  {
    name: 'Базовый',
    code: 'basic',
    price: 299,
    channelsLimit: 2,
    promptsLimit: 3,
    description: 'Идеально для начала работы с одним каналом',
    features: [
      'До 2 каналов',
      'До 3 промтов', 
      'Автопостинг новостей',
      'Базовая поддержка'
    ]
  },
  {
    name: 'Продвинутый',
    code: 'advanced', 
    price: 599,
    channelsLimit: 5,
    promptsLimit: 10,
    description: 'Для активных пользователей с несколькими каналами',
    features: [
      'До 5 каналов',
      'До 10 промтов',
      'Расширенные настройки времени',
      'Приоритетная поддержка'
    ]
  },
  {
    name: 'Профессиональный',
    code: 'professional',
    price: 1299,
    channelsLimit: 999,
    promptsLimit: 999,
    description: 'Полный функционал без ограничений',
    features: [
      'Неограниченное количество каналов',
      'Неограниченное количество промтов', 
      'Максимальные настройки расписания',
      'Высший приоритет поддержки'
    ]
  }
];

async function init() {
  try {
    await mongoose.connect(config.database.uri);
    console.log('✅ Connected to database');

    for (const planData of defaultPlans) {
      await SubscriptionPlan.findOneAndUpdate(
        { code: planData.code },
        planData,
        { upsert: true, new: true }
      );
      console.log(`✅ Plan "${planData.name}" initialized`);
    }

    console.log('✅ All plans initialized successfully');
    
  } catch (error) {
    console.error('❌ Initialization error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit();
  }
}

init();