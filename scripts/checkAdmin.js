require('dotenv').config();
const { BOT_CONFIG } = require('../config');

console.log('🔍 Проверка конфигурации администратора:');
console.log('BOT_TOKEN:', process.env.BOT_TOKEN ? '✅ Установлен' : '❌ Отсутствует');
console.log('ADMIN_IDS:', process.env.ADMIN_IDS || '❌ Не установлены');
console.log('Parsed ADMIN_IDS:', BOT_CONFIG.ADMIN_IDS);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Установлен' : '❌ Отсутствует');

if (BOT_CONFIG.ADMIN_IDS.length === 0) {
  console.log('\n❌ ОШИБКА: ADMIN_IDS не установлены в .env файле');
  console.log('Добавьте в .env:');
  console.log('ADMIN_IDS=123456789,987654321');
  console.log('\nГде 123456789 - ваш Telegram ID');
} else {
  console.log('\n✅ Конфигурация в порядке');
}