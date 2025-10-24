const cron = require('node-cron');
const RssService = require('./RSSService');
const AIService = require('./AIService');
const UserService = require('./UserService');
const Channel = require('../models/Channel');

class AutoPostService {
    constructor() {
        this.jobs = new Map();
        this.bot = null;
    }

    /**
     * Устанавливает экземпляр бота для публикации
     */
    setBot(botInstance) {
        this.bot = botInstance;
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

        // Задача для проверки расписания - каждую минуту для точного времени
        cron.schedule('* * * * *', async () => {
            try {
                await this.processScheduledTimes();
            } catch (error) {
                console.error('❌ Ошибка в задаче расписания:', error);
            }
        });

        console.log('✅ Сервис автопостинга запущен');
    }

    /**
     * Обрабатывает посты по времени расписания
     */
    async processScheduledTimes() {
        try {
            const now = new Date();
            const currentTime = this.formatTime(now); // "14:30"
            
            console.log(`⏰ Проверка расписания публикаций в ${currentTime}...`);
            
            // Находим все каналы с автопостингом и расписанием
            const channels = await Channel.find({
                'settings.autoPublish': true,
                'settings.schedule.enabled': true
            }).populate('owner');

            let published = 0;
            let matched = 0;

            for (const channel of channels) {
                try {
                    // Проверяем, есть ли текущее время в расписании канала
                    const scheduleTimes = channel.settings.schedule.times || [];
                    
                    if (scheduleTimes.includes(currentTime)) {
                        matched++;
                        console.log(`🎯 Найдено совпадение для ${channel.title} в ${currentTime}`);
                        
                        const result = await this.processChannelPosts(channel);
                        published += result.published;
                        
                        console.log(`✅ Запущено по расписанию для ${channel.title} в ${currentTime}`);
                    }
                } catch (error) {
                    console.error(`❌ Ошибка расписания для ${channel.title}:`, error);
                }
            }

            if (matched > 0) {
                console.log(`📊 По расписанию ${currentTime}: найдено ${matched} каналов, опубликовано ${published} постов`);
            }

            return { published, matched };

        } catch (error) {
            console.error('❌ Ошибка в processScheduledTimes:', error);
            throw error;
        }
    }

    /**
     * Форматирует время в формат HH:MM
     */
    formatTime(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * Обрабатывает посты по интервальному расписанию
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
                    const interval = channel.settings.schedule.interval || 60; // минут по умолчанию
                    
                    // Если никогда не запускался или прошло больше интервала
                    if (!lastRun || (now - new Date(lastRun)) >= interval * 60 * 1000) {
                        const result = await this.processChannelPosts(channel);
                        if (result.published > 0) {
                            // Обновляем время последнего запуска
                            channel.settings.schedule.lastRun = now;
                            await channel.save();
                        }
                        
                        processed++;
                        published += result.published;
                    }

                } catch (error) {
                    console.error(`❌ Ошибка обработки канала ${channel.title}:`, error);
                }
            }

            if (processed > 0) {
                console.log(`✅ Обработано ${processed} каналов, опубликовано ${published} постов`);
            }

            return { processed, published };

        } catch (error) {
            console.error('❌ Ошибка в processScheduledPosts:', error);
            throw error;
        }
    }

    /**
     * Обрабатывает посты для конкретного канала
     */
    async processChannelPosts(channel) {
        let published = 0;

        try {
            console.log(`🔍 Обработка канала: ${channel.title} (режим: ${channel.settings.mode})`);

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
                    
                default:
                    console.log(`❌ Неизвестный режим канала: ${channel.settings.mode}`);
            }

            // Обновляем статистику
            if (published > 0) {
                if (!channel.statistics) {
                    channel.statistics = {
                        totalPosts: 0,
                        lastPostDate: new Date(),
                        postsToday: 0
                    };
                }
                
                channel.statistics.totalPosts += published;
                channel.statistics.lastPostDate = new Date();
                channel.statistics.postsToday = (channel.statistics.postsToday || 0) + published;
                await channel.save();
                
                console.log(`✅ Опубликовано ${published} постов в канале ${channel.title}`);
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
            console.log(`📡 Обработка RSS для канала: ${channel.title}`);
            
            // Используем существующий RSS сервис
            const result = await RssService.processChannelFeeds(channel);
            console.log(`📡 RSS результат для ${channel.title}: ${result.published} постов`);
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
            console.log(`🤖 Генерация AI поста для канала: ${channel.title}`);
            
            // Генерируем AI пост
            const aiContent = await this.generateAIPost(channel);
            if (aiContent) {
                // Публикуем в канал
                const published = await this.publishToTelegram(channel, aiContent);
                
                if (published) {
                    // Увеличиваем счетчик
                    await UserService.incrementPostCount(channel.owner._id);
                    return 1;
                }
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
            const topics = channel.aiSettings?.topics?.length > 0 
                ? channel.aiSettings.topics.join(', ')
                : 'актуальные новости и интересные факты';

            const tone = channel.aiSettings?.tone || 'professional';

            const prompt = `
Создай интересный пост для Telegram канала на тему: ${topics}

Требования:
- Стиль: ${tone}
- Длина: 500-1000 символов
- Добавь 3-5 релевантных хештегов
- Сделай текст увлекательным и полезным
- Форматируй для лучшей читаемости

Пост:`;

            return await AIService.generatePost(prompt, tone);
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
            if (!this.bot) {
                console.error('❌ Bot not available for publishing');
                return false;
            }
            
            // Проверяем настройки поста
            const postSettings = channel.settings?.postSettings || {
                maxLength: 4000,
                watermark: '',
                parseMode: 'HTML'
            };
            
            // Обрезаем контент если нужно
            if (content.length > postSettings.maxLength) {
                content = content.substring(0, postSettings.maxLength - 100) + '...';
            }
            
            // Добавляем водяной знак если есть
            if (postSettings.watermark) {
                content += `\n\n${postSettings.watermark}`;
            }
            
            await this.bot.telegram.sendMessage(channel.channelId, content, {
                parse_mode: postSettings.parseMode
            });
            
            console.log(`✅ Опубликован пост в канале ${channel.title}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Ошибка публикации в ${channel.title}:`, error.message);
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

            console.log(`🔧 Принудительная обработка канала: ${channel.title}`);
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
        try {
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
            
            // Каналы с расписанием по времени
            const timeScheduledChannels = await Channel.find({
                'settings.autoPublish': true,
                'settings.schedule.enabled': true,
                'settings.schedule.times.0': { $exists: true }
            });
            
            return {
                totalChannels,
                activeChannels,
                rssChannels,
                aiChannels,
                combinedChannels: totalChannels - rssChannels - aiChannels,
                timeScheduledChannels: timeScheduledChannels.length,
                timeSchedules: timeScheduledChannels.flatMap(ch => ch.settings.schedule.times || [])
            };
        } catch (error) {
            console.error('❌ Ошибка получения статистики:', error);
            return {
                totalChannels: 0,
                activeChannels: 0,
                rssChannels: 0,
                aiChannels: 0,
                combinedChannels: 0,
                timeScheduledChannels: 0,
                timeSchedules: []
            };
        }
    }

    /**
     * Проверяет расписание для отладки
     */
    async debugSchedule() {
        const now = new Date();
        const currentTime = this.formatTime(now);
        
        console.log('🐛 Отладка расписания:');
        console.log(`- Текущее время: ${currentTime}`);
        
        const channels = await Channel.find({
            'settings.autoPublish': true,
            'settings.schedule.enabled': true
        });
        
        console.log(`- Всего каналов с расписанием: ${channels.length}`);
        
        for (const channel of channels) {
            const times = channel.settings.schedule.times || [];
            const hasMatch = times.includes(currentTime);
            
            console.log(`- ${channel.title}: ${times.join(', ')} ${hasMatch ? '✅ СОВПАДЕНИЕ' : ''}`);
        }
        
        return {
            currentTime,
            totalChannels: channels.length,
            channels: channels.map(ch => ({
                title: ch.title,
                times: ch.settings.schedule.times,
                hasMatch: ch.settings.schedule.times.includes(currentTime)
            }))
        };
    }
}

module.exports = new AutoPostService();