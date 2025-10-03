const fs = require('fs');
const path = require('path');
const { BOT_CONFIG } = require('../config');

class ConfigService {
  constructor() {
    this.configPath = path.join(__dirname, '../config');
    this.envFilePath = path.join(__dirname, '../.env');
  }

  // Получить текущий API ключ (без полного значения для безопасности)
  getCurrentAIKey() {
    const key = process.env.OPENAI_API_KEY || BOT_CONFIG.OPENAI_API_KEY;
    if (!key) return null;
    
    // Показываем только первые и последние 4 символа для безопасности
    if (key.length <= 8) return key;
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  }

  // Проверить валидность API ключа
  async validateAIKey(apiKey) {
    try {
      // Базовая проверка формата ключа
      if (!apiKey || !apiKey.startsWith('sk-')) {
        return { valid: false, error: 'Неверный формат API ключа. Ключ должен начинаться с sk-' };
      }

      if (apiKey.length < 20) {
        return { valid: false, error: 'Слишком короткий API ключ' };
      }

      // Опционально: проверка ключа через тестовый запрос к OpenAI
      // const OpenAI = require('openai');
      // const openai = new OpenAI({ apiKey });
      // await openai.models.list();
      
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: `Ошибка проверки ключа: ${error.message}` };
    }
  }

  // Обновить API ключ в .env файле
  async updateAIKey(newApiKey) {
    try {
      if (!fs.existsSync(this.envFilePath)) {
        throw new Error('Файл .env не найден');
      }

      let envContent = fs.readFileSync(this.envFilePath, 'utf8');
      const lines = envContent.split('\n');
      let keyUpdated = false;

      const newLines = lines.map(line => {
        if (line.startsWith('OPENAI_API_KEY=')) {
          keyUpdated = true;
          return `OPENAI_API_KEY=${newApiKey}`;
        }
        return line;
      });

      // Если ключ не найден, добавляем новую строку
      if (!keyUpdated) {
        newLines.push(`OPENAI_API_KEY=${newApiKey}`);
      }

      // Создаем backup текущего файла
      const backupPath = `${this.envFilePath}.backup.${Date.now()}`;
      fs.writeFileSync(backupPath, envContent);

      // Записываем обновленный файл
      fs.writeFileSync(this.envFilePath, newLines.join('\n'));

      // Обновляем переменную окружения в текущем процессе
      process.env.OPENAI_API_KEY = newApiKey;

      return { 
        success: true, 
        backupFile: backupPath,
        message: 'API ключ успешно обновлен'
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Ошибка при обновлении API ключа: ${error.message}`
      };
    }
  }

  // Получить историю изменений ключей
  getKeyChangeHistory() {
    try {
      const historyPath = path.join(this.configPath, 'key_history.json');
      if (fs.existsSync(historyPath)) {
        return JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  // Сохранить историю изменений
  async saveKeyChangeHistory(oldKeyPreview, newKeyPreview, adminId) {
    try {
      const historyPath = path.join(this.configPath, 'key_history.json');
      const history = this.getKeyChangeHistory();
      
      history.unshift({
        timestamp: new Date().toISOString(),
        oldKey: oldKeyPreview,
        newKey: newKeyPreview,
        adminId: adminId,
        adminName: `User ${adminId}`
      });

      // Сохраняем только последние 10 изменений
      const limitedHistory = history.slice(0, 10);
      
      fs.writeFileSync(historyPath, JSON.stringify(limitedHistory, null, 2));
    } catch (error) {
      console.error('Error saving key history:', error);
    }
  }
}

module.exports = new ConfigService();