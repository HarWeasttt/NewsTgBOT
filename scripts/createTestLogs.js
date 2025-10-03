const LogService = require('../services/LogService');
const fs = require('fs');
const path = require('path');

async function quickTest() {
  try {
    console.log('⚡ Быстрое создание тестовых логов...\n');
    
    // Просто создаем один тестовый файл
    const testLog = `
2024-01-01 12:00:00 [INFO] Test log created successfully
2024-01-01 12:01:00 [INFO] Bot is running normally
2024-01-01 12:02:00 [WARN] Low memory warning
2024-01-01 12:03:00 [ERROR] Test error message
2024-01-01 12:04:00 [INFO] Recovery completed
    `.trim();
    const filePath = path.join(__dirname, '../logs/quick_test.log');
    fs.writeFileSync(filePath, testLog);
    
    console.log('✅ Быстрый тестовый лог создан: quick_test.log');
    console.log('📍 Файл: logs/quick_test.log');
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  }
}

quickTest();