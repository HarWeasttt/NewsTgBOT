const cron = require('node-cron');
const { Schedule, User, Channel, Prompt } = require('../models');
const newsService = require('./newsService');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

class SchedulerService {
  constructor(bot) {
    this.bot = bot;
    this.isRunning = false;
  }

  init() {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    // Проверка каждые 30 минут
    cron.schedule('*/30 * * * *', () => {
      this.checkSchedules();
    });

    // Очистка кэша новостей каждый час
    cron.schedule('0 * * * *', () => {
      newsService.clearCache();
    });

    logger.info('✅ Scheduler initialized');
    this.isRunning = true;
  }

  async checkSchedules() {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentDay = now.getDay(); // 0 - Воскресенье

      // Найти активные расписания для текущего дня
      const activeSchedules = await Schedule.find({
        isActive: true,
        daysOfWeek: currentDay
      }).populate('prompt').populate('channel');

      logger.info(`Checking ${activeSchedules.length} active schedules`);

      for (const schedule of activeSchedules) {
        try {
          await this.processSchedule(schedule, currentHour, currentMinute);
        } catch (error) {
          logger.error(`Error processing schedule ${schedule._id}:`, error);
        }
      }

    } catch (error) {
      logger.error('Scheduler error:', error);
    }
  }

  async processSchedule(schedule, currentHour, currentMinute) {
    // Проверка активности пользователя
    const user = await User.findById(schedule.prompt.owner);
    if (!user || !user.hasActiveSubscription()) {
      logger.info(`User ${schedule.prompt.owner} has no active subscription, skipping schedule`);
      return;
    }

    // Проверка активности канала и промта
    if (!schedule.channel.isActive || !schedule.prompt.isActive) {
      return;
    }

    // Проверка времени
    if (!this.isTimeToPost(schedule, currentHour, currentMinute)) {
      return;
    }

    // Проверка, чтобы не публиковать слишком часто
    if (schedule.lastPosted) {
      const lastPost = new Date(schedule.lastPosted);
      const hoursSinceLastPost = (Date.now() - lastPost.getTime()) / (1000 * 60 * 60);
      const minInterval = 24 / schedule.postsPerDay;
      
      if (hoursSinceLastPost < minInterval - 1) {
        return;
      }
    }

    // Публикация новости
    await this.publishNews(schedule);
  }

  isTimeToPost(schedule, currentHour, currentMinute) {
    const currentTime = currentHour * 60 + currentMinute;

    if (schedule.timeSlots.type === 'exact') {
      return schedule.timeSlots.exactTimes.some(time => {
        const [hour, minute] = time.split(':').map(Number);
        const scheduleTime = hour * 60 + minute;
        return Math.abs(currentTime - scheduleTime) <= 30; // ±30 минут
      });
    } else {
      const [fromHour, fromMinute] = schedule.timeSlots.from.split(':').map(Number);
      const [toHour, toMinute] = schedule.timeSlots.to.split(':').map(Number);
      
      const fromTime = fromHour * 60 + fromMinute;
      const toTime = toHour * 60 + toMinute;

      return currentTime >= fromTime && currentTime <= toTime;
    }
  }

  async publishNews(schedule) {
    try {
      const articles = await newsService.getNewsByQuery(
        schedule.prompt.query,
        { language: schedule.prompt.language }
      );

      const filteredArticles = newsService.filterArticles(
        articles, 
        schedule.prompt.keywordsToExclude
      );

      const articleToPublish = newsService.pickRandomArticle(filteredArticles);

      if (!articleToPublish) {
        logger.warn(`No articles found for prompt: "${schedule.prompt.query}"`);
        return;
      }

      // Форматирование поста
      const postText = Helpers.formatPost(
        schedule.channel.postTemplate,
        articleToPublish
      );

      // Отправка в канал
      await this.bot.telegram.sendMessage(schedule.channel.telegramId, postText, {
        disable_web_page_preview: false
      });

      // Обновление времени последней публикации
      await Schedule.findByIdAndUpdate(schedule._id, {
        lastPosted: new Date()
      });

      logger.info(`News published to channel ${schedule.channel.title}`);

    } catch (error) {
      logger.error(`Publishing error for schedule ${schedule._id}:`, error);
      
      // Если бота удалили из канала, деактивируем расписание
      if (error.description?.includes('bot was kicked') || 
          error.description?.includes('chat not found')) {
        await Schedule.findByIdAndUpdate(schedule._id, { isActive: false });
        logger.info(`Schedule ${schedule._id} deactivated due to channel issues`);
      }
    }
  }
}

module.exports = SchedulerService;