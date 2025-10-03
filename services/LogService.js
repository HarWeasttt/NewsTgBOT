const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

class LogService {
  constructor() {
    this.logsDir = path.join(__dirname, '../logs');
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  async getLogFiles() {
    try {
      const files = await readdir(this.logsDir);
      const logFiles = [];

      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logsDir, file);
          const fileStat = await stat(filePath);
          logFiles.push({
            name: file,
            path: filePath,
            size: fileStat.size,
            modified: fileStat.mtime,
            sizeFormatted: this.formatFileSize(fileStat.size)
          });
        }
      }

      return logFiles.sort((a, b) => b.modified - a.modified);
    } catch (error) {
      console.error('Error reading log files:', error);
      return [];
    }
  }

  async readLogFile(filename, lines = 50) {
    try {
      const filePath = path.join(this.logsDir, filename);
      if (!fs.existsSync(filePath)) {
        throw new Error('Log file not found');
      }

      const content = await readFile(filePath, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim());
      
      // Возвращаем последние N строк
      const recentLines = allLines.slice(-lines);
      return {
        filename,
        totalLines: allLines.length,
        lines: recentLines,
        hasMore: allLines.length > lines
      };
    } catch (error) {
      console.error('Error reading log file:', error);
      throw error;
    }
  }

  async getSystemInfo() {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    return {
      memory: {
        rss: (memoryUsage.rss / 1024 / 1024).toFixed(2),
        heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(2),
        heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
        external: (memoryUsage.external / 1024 / 1024).toFixed(2)
      },
      uptime: `${hours}ч ${minutes}м ${seconds}с`,
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid
    };
  }

  async clearLogFile(filename) {
    try {
      const filePath = path.join(this.logsDir, filename);
      if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error clearing log file:', error);
      throw error;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatLogLine(line) {
    // Обрезаем длинные строки для лучшего отображения в Telegram
    if (line.length > 200) {
      return line.substring(0, 197) + '...';
    }
    return line;
  }
}

module.exports = new LogService();