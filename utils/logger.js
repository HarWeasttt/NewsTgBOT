const winston = require('winston');
const path = require('path');

// Создаем папку для логов
const logsDir = path.join(__dirname, '../logs');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}${stack ? `\n${stack}` : ''}`;
    })
  ),
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Логирование для бота
const botLogger = {
  info: (message, metadata = {}) => {
    logger.info(`[BOT] ${message}`, metadata);
  },
  error: (message, error = null) => {
    if (error) {
      logger.error(`[BOT] ${message} - ${error.message}`, { stack: error.stack });
    } else {
      logger.error(`[BOT] ${message}`);
    }
  },
  warn: (message) => {
    logger.warn(`[BOT] ${message}`);
  },
  debug: (message) => {
    logger.debug(`[BOT] ${message}`);
  }
};

module.exports = {
  logger,
  botLogger
};