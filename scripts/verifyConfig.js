require('dotenv').config();
const { BOT_CONFIG } = require('../config');

console.log('🔍 Проверка конфигурации:');
console.log('========================');

console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ Установлен' : '❌ ОТСУТСТВУЕТ');
console.log('ADMIN_IDS:', process.env.ADMIN_IDS || '❌ ОТСУТСТВУЕТ');
console.log('Parsed ADMIN_IDS:', BOT_CONFIG.ADMIN_IDS);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Установлен' : '❌ ОТСУТСТВУЕТ');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Установлен' : '❌ ОТСУТСТВУЕТ');

console.log('\n📋 Инструкция:');
if (!process.env.ADMIN_IDS) {
  console.log('1. Добавьте в .env файл:');
  console.log('   ADMIN_IDS=ВАШ_TELEGRAM_ID');
  console.log('2. Чтобы узнать ваш Telegram ID, напишите боту @userinfobot');
}

if (BOT_CONFIG.ADMIN_IDS.length > 0) {
  console.log('\n✅ Вы администратор с ID:', BOT_CONFIG.ADMIN_IDS);
} else {
  console.log('\n❌ ADMIN_IDS не настроены!');
}