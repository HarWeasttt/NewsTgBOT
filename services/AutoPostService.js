const cron = require('node-cron');
const RssService = require('./RSSService');
const AIService = require('./AIService');
const UserService = require('./UserService');
const Channel = require('../models/Channel');

class AutoPostService {
    constructor() {
        this.jobs = new Map();
    }

    /**
     * Запускает сервис автопостинга
     */
    start() {
        console.log('🚀 Запуск сервиса автопостинга...');
        
        // Задача для RSS постов - каждые 30 минут
        cron.schedule('*/30 * * * *', async () => {
            console.log('⏰ Запуск RSS обработки по расписанию...');
            try {
                await this.processScheduledPosts();
            } catch (error) {
                console.error('❌ Ошибка в задаче автопостинга:', error);
            }
        });

        // Задача для проверки расписания - каждые 10 минут
        cron.schedule('*/10 * * * *', async () => {
            console.log('⏰ Проверка расписания публикаций...');
            try {
                await this.processScheduledTimes();
            } catch (error) {
                console.error('❌ Ошибка в задаче расписания:', error);
            }
        });

        console.log('✅ Сервис автопостинга запущен');
    }

    /**
     * Обрабатывает посты по расписанию
     */
    async processScheduledPosts() {
        try {
            const channels = await Channel.find({
                'settings.autoPublish': true,
                'settings.schedule.enabled': true
            }).populate('owner');

            let processed = 0;
            let published = 0;

            for (const channel of channels) {
                try {
                    // Проверяем время последнего запуска
                    const now = new Date();
                    const lastRun = channel.settings.schedule.lastRun;
                    const interval = channel.settings.schedule.interval;
                    
                    if (lastRun && (now - lastRun) < interval * 60 * 1000) {
                        continue; // Еще не время
                    }

                    const result = await this.processChannelPosts(channel);
                    if (result.published > 0) {
                        // Обновляем время последнего запуска
                        channel.settings.schedule.lastRun = now;
                        await channel.save();
                    }
                    
                    processed++;
                    published += result.published;

                } catch (error) {
                    console.error(`❌ Ошибка обработки канала ${channel.title}:`, error);
                }
            }

            console.log(`✅ Обработано ${processed} каналов, опубликовано ${published} постов`);
            return { processed, published };

        } catch (error) {
            console.error('❌ Ошибка в processScheduledPosts:', error);
            throw error;
        }
    }

    /**
     * Обрабатывает посты по времени расписания
     */
    async processScheduledTimes() {
        try {
            const now = new Date();
            const currentTime = now.toTimeString().slice(0, 5); // "14:30"
            
            const channels = await Channel.find({
                'settings.autoPublish': true,
                'settings.schedule.enabled': true,
                'settings.schedule.times': currentTime
            }).populate('owner');

            let published = 0;

            for (const channel of channels) {
                try {
                    const result = await this.processChannelPosts(channel);
                    published += result.published;
                    
                    console.log(`✅ Запущено по расписанию для ${channel.title} в ${currentTime}`);
                } catch (error) {
                    console.error(`❌ Ошибка расписания для ${channel.title}:`, error);
                }
            }

            return { published };

        } catch (error) {
            console.error('❌ Ошибка в processScheduledTimes:', error);
            throw error;
        }
    }

    /**
     * Обрабатывает посты для конкретного канала
     */
    async processChannelPosts(channel) {
        let published = 0;

        try {
            // Проверяем лимиты пользователя
            const canPost = await UserService.canUserPost(channel.owner);
            if (!canPost) {
                console.log(`⏸️ Достигнут лимит постов для пользователя ${channel.owner.telegramId}`);
                return { published: 0 };
            }

            // Обрабатываем в зависимости от режима канала
            switch (channel.settings.mode) {
                case 'rss':
                    published += await this.processRSSPosts(channel);
                    break;
                    
                case 'ai':
                    published += await this.processAIPosts(channel);
                    break;
                    
                case 'combined':
                    const rssResult = await this.processRSSPosts(channel);
                    if (rssResult === 0) {
                        published += await this.processAIPosts(channel);
                    } else {
                        published += rssResult;
                    }
                    break;
            }

            // Обновляем статистику
            if (published > 0) {
                channel.statistics.totalPosts += published;
                channel.statistics.lastPostDate = new Date();
                await channel.save();
            }

            return { published };

        } catch (error) {
            console.error(`❌ Ошибка обработки канала ${channel.title}:`, error);
            return { published: 0 };
        }
    }

    /**
     * Обрабатывает RSS посты
     */
    async processRSSPosts(channel) {
        try {
            // Используем существующий RSS сервис
            const result = await RssService.processChannelFeeds(channel);
            return result.published;
        } catch (error) {
            console.error(`❌ Ошибка RSS обработки для ${channel.title}:`, error);
            return 0;
        }
    }

    /**
     * Обрабатывает AI посты
     */
    async processAIPosts(channel) {
        try {
            // Генерируем AI пост
            const aiContent = await this.generateAIPost(channel);
            if (aiContent) {
                // Публикуем в канал
                await this.publishToTelegram(channel, aiContent);
                
                // Увеличиваем счетчик
                await UserService.incrementPostCount(channel.owner._id);
                
                return 1;
            }
            return 0;
        } catch (error) {
            console.error(`❌ Ошибка AI обработки для ${channel.title}:`, error);
            return 0;
        }
    }

    /**
     * Генерирует AI пост
     */
    async generateAIPost(channel) {
        try {
            const topics = channel.aiSettings.topics.length > 0 
                ? channel.aiSettings.topics.join(', ')
                : 'актуальные новости и интересные факты';

            const prompt = `
Создай интересный пост для Telegram канала на тему: ${topics}

Требования:
- Стиль: ${channel.aiSettings.tone}
- Длина: 500-1000 символов
- Добавь 3-5 релевантных хештегов
- Сделай текст увлекательным и полезным
- Форматируй для лучшей читаемости

Пост:`;

            return await AIService.generatePost(prompt, channel.aiSettings.tone);
        } catch (error) {
            console.error('❌ Ошибка генерации AI поста:', error);
            return null;
        }
    }

    /**
     * Публикует пост в Telegram
     */
    async publishToTelegram(channel, content) {
        try {
            const telegram = require('../bot');
            
            // Обрезаем контент если нужно
            if (content.length > channel.settings.postSettings.maxLength) {
                content = content.substring(0, channel.settings.postSettings.maxLength - 100) + '...';
            }
            
            // Добавляем водяной знак если есть
            if (channel.settings.postSettings.watermark) {
                content += `\n\n${channel.settings.postSettings.watermark}`;
            }
            
            await telegram.telegram.sendMessage(channel.channelId, content, {
                parse_mode: channel.settings.postSettings.parseMode
            });
            
            console.log(`✅ Опубликован пост в канале ${channel.title}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Ошибка публикации в ${channel.title}:`, error);
            return false;
        }
    }

    /**
     * Принудительно запускает обработку канала
     */
    async forceProcessChannel(channelId) {
        try {
            const channel = await Channel.findById(channelId).populate('owner');
            if (!channel) {
                throw new Error('Канал не найден');
            }

            const result = await this.processChannelPosts(channel);
            return result;
        } catch (error) {
            console.error('❌ Ошибка принудительной обработки:', error);
            throw error;
        }
    }

    /**
     * Получает статистику автопостинга
     */
    async getAutoPostStats() {
        const totalChannels = await Channel.countDocuments({
            'settings.autoPublish': true
        });
        
        const activeChannels = await Channel.countDocuments({
            'settings.autoPublish': true,
            'settings.schedule.enabled': true
        });
        
        const rssChannels = await Channel.countDocuments({
            'settings.autoPublish': true,
            'settings.mode': 'rss'
        });
        
        const aiChannels = await Channel.countDocuments({
            'settings.autoPublish': true,
            'settings.mode': 'ai'
        });
        
        return {
            totalChannels,
            activeChannels,
            rssChannels,
            aiChannels,
            combinedChannels: totalChannels - rssChannels - aiChannels
        };
    }
}

module.exports = new AutoPostService();