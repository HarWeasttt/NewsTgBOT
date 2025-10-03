const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class BotManager {
  constructor() {
    this.restartLogPath = path.join(__dirname, '../logs/restarts.log');
  }

  // Логирование перезапусков
  logRestart(adminId, reason = 'manual') {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        adminId,
        reason,
        pid: process.pid
      };

      const logLine = `${logEntry.timestamp} [RESTART] Admin ${adminId} - ${reason} (PID: ${pid})\n`;
      
      fs.appendFileSync(this.restartLogPath, logLine);
    } catch (error) {
      console.error('Error logging restart:', error);
    }
  }

  // Мягкий перезапуск (перезагрузка модулей)
  async softRestart() {
    try {
      // Очищаем кеш определенных модулей
      const modulesToReload = [
        '../services/AIService',
        '../services/ConfigService',
        '../config'
      ];

      modulesToReload.forEach(modulePath => {
        const fullPath = require.resolve(modulePath);
        delete require.cache[fullPath];
      });

      return { success: true, type: 'soft', message: 'Модули перезагружены' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Полный перезапуск процесса (требует PM2 или системы управления процессами)
  async fullRestart() {
    return new Promise((resolve) => {
      this.logRestart('system', 'full_restart_initiated');

      // Если используется PM2
      if (process.env.PM2_HOME) {
        exec('pm2 restart news-bot', (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: error.message });
          } else {
            resolve({ success: true, type: 'pm2', message: 'Перезапуск через PM2 инициирован' });
          }
        });
      } else {
        // Для обычного запуска - просто выходим и полагаемся на систему управления процессами
        resolve({ 
          success: true, 
          type: 'process_exit', 
          message: 'Процесс будет завершен. Используйте систему управления процессами для автоматического перезапуска.' 
        });

        // Даем время на отправку ответа перед выходом
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      }
    });
  }

  // Получить информацию о процессе
  getProcessInfo() {
    return {
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      pm2: !!process.env.PM2_HOME,
      restartCount: this.getRestartCount()
    };
  }

  // Получить количество перезапусков
  getRestartCount() {
    try {
      if (fs.existsSync(this.restartLogPath)) {
        const content = fs.readFileSync(this.restartLogPath, 'utf8');
        return (content.match(/\[RESTART\]/g) || []).length;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }
}

module.exports = new BotManager();