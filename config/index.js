const dotenv = require('dotenv');
dotenv.config();

const config = {
  bot: {
    token: process.env.BOT_TOKEN,
    adminIds: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [],
    webhookUrl: process.env.WEBHOOK_URL
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/news_telegram_bot'
  },
  news: {
    apiKey: process.env.NEWS_API_KEY
  },
  payments: {
    yookassa: {
      shopId: process.env.YOOKASSA_SHOP_ID,
      secretKey: process.env.YOOKASSA_SECRET_KEY
    }
  },
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },
  subscription: {
    trialDays: 7
  }
};

module.exports = config;