const mongoose = require('mongoose');
require('dotenv').config();

async function showStats() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const User = require('../models/User');
  const Channel = require('../models/Channel');
  const Transaction = require('../models/Transaction');
  
  const [
    totalUsers,
    activeUsers,
    totalChannels,
    todayRevenue,
    activeSubscriptions
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isBlocked: false }),
    Channel.countDocuments(),
    Transaction.aggregate([
      { 
        $match: { 
          status: 'completed',
          createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    User.countDocuments({ 
      'subscription.plan': { $ne: 'FREE' },
      'subscription.endDate': { $gt: new Date() }
    })
  ]);
  
  console.log(`
📊 Статистика системы:

👥 Пользователи:
• Всего: ${totalUsers}
• Активных: ${activeUsers}
• Подписок: ${activeSubscriptions}

📺 Каналы:
• Всего: ${totalChannels}

💰 Финансы:
• Выручка сегодня: ${todayRevenue[0]?.total || 0} звезд

💫 Производительность:
• Память: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
• Uptime: ${Math.floor(process.uptime() / 60)} минут
  `);
  
  await mongoose.disconnect();
}

showStats().catch(console.error);