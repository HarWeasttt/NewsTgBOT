const Queue = require('bull');
const { Telegraf } = require('telegraf');
const { BOT_CONFIG } = require('../config');
const UserService = require('../services/UserService');

class PostQueue {
  constructor() {
    this.queue = new Queue('post publishing', BOT_CONFIG.REDIS_URL);
    this.bot = new Telegraf(BOT_CONFIG.TOKEN); // Создаем отдельный экземпляр бота для очереди
    this.setupProcessor();
    this.setupEventListeners();
  }

  setupProcessor() {
    this.queue.process('publish-post', async (job) => {
      const { channelId, content, userId } = job.data;
      console.log(`🔄 Processing post for channel ${channelId}, user ${userId}`);
      
      try {
        // Проверяем лимиты пользователя
        const user = await UserService.getUserById(userId);
        if (!user) {
          throw new Error(`User ${userId} not found`);
        }

        if (!await UserService.canUserPost(user)) {
          throw new Error(`User ${userId} reached daily limit`);
        }

        // Публикуем пост
        await this.publishToChannel(channelId, content);
        
        // Обновляем счетчик
        await UserService.incrementPostCount(user);
        
        console.log(`✅ Post published to channel ${channelId}`);
        return { success: true, channelId, userId };
      } catch (error) {
        console.error('❌ Post publishing error:', error.message);
        throw error;
      }
    });
  }

  setupEventListeners() {
    this.queue.on('completed', (job, result) => {
      console.log(`✅ Job ${job.id} completed for channel ${result.channelId}`);
    });
    
    this.queue.on('failed', (job, err) => {
      console.error(`❌ Job ${job.id} failed:`, err.message);
    });
    
    this.queue.on('stalled', (job) => {
      console.log(`⚠️ Job ${job.id} stalled`);
    });
  }

  async publishToChannel(channelId, content) {
    try {
      await this.bot.telegram.sendMessage(channelId, content, {
        parse_mode: 'HTML'
      });
      console.log(`✅ Message sent to channel ${channelId}`);
    } catch (error) {
      console.error(`❌ Error publishing to channel ${channelId}:`, error.message);
      
      if (error.description === 'Forbidden: bot was blocked by the user') {
        console.log(`🚫 Bot was blocked from channel ${channelId}`);
        // Можно добавить логику удаления канала из базы
      } else if (error.description === 'Forbidden: bot is not a member of the channel') {
        console.log(`🚫 Bot is not member of channel ${channelId}`);
        // Можно добавить логику удаления канала из базы  
      } else if (error.description === 'Bad Request: chat not found') {
        console.log(`🚫 Chat not found: ${channelId}`);
      } else {
        // Пробрасываем другие ошибки
        throw error;
      }
    }
  }

  async add(postData, delay = 0) {
    const options = {
      removeOnComplete: 100, // Оставлять 100 завершенных jobs
      removeOnFail: 100,     // Оставлять 100 неудачных jobs
      attempts: 3,           // Количество попыток
      backoff: 5000          // Задержка между попытками (5 сек)
    };
    
    if (delay > 0) {
      options.delay = delay;
    }
    
    const job = await this.queue.add('publish-post', postData, options);
    console.log(`📨 Job ${job.id} added to queue`);
    return job;
  }

  async schedulePost(channelId, content, publishAt, userId) {
    const delay = Math.max(0, publishAt.getTime() - Date.now());
    
    if (delay === 0) {
      console.log('⚠️ Schedule time is in the past, publishing immediately');
    }
    
    return await this.add({ 
      channelId, 
      content, 
      userId 
    }, delay);
  }

  // Методы для управления очередью
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
      this.queue.getCompleted(),
      this.queue.getFailed(),
      this.queue.getDelayed()
    ]);
    
    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length
    };
  }

  async cleanup() {
    await this.bot.stop();
    await this.queue.close();
  }
}

module.exports = new PostQueue();