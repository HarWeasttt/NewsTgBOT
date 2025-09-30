const mongoose = require('mongoose');
const { BOT_CONFIG } = require('../config');

async function setup() {
  try {
    await mongoose.connect(BOT_CONFIG.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Создаем индексы для оптимизации
    const User = require('../models/User');
    const Channel = require('../models/Channel');
    const Transaction = require('../models/Transaction');

    await User.collection.createIndex({ telegramId: 1 }, { unique: true });
    await Channel.collection.createIndex({ owner: 1 });
    await Channel.collection.createIndex({ telegramId: 1 });
    await Transaction.collection.createIndex({ userId: 1 });
    await Transaction.collection.createIndex({ createdAt: 1 });

    console.log('✅ Database indexes created');
    console.log('🎉 Setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

setup();