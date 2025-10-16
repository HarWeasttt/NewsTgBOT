const Parser = require('rss-parser');
const AIService = require('./AIService');
const UserService = require('./UserService');
const Channel = require('../models/Channel');

class RssService {
    constructor() {
        this.parser = new Parser({
            timeout: 15000,
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            },
            customFields: {
                item: [
                    ['content:encoded', 'contentEncoded'],
                    ['media:content', 'mediaContent'],
                    ['enclosure', 'enclosure'],
                    ['description', 'description'],
                    ['summary', 'summary']
                ]
            }
        });
    }

    /** Валидация RSS URL */
    validateRssUrl(url) {
        try {
            const urlObj = new URL(url);
            
            // Проверяем допустимые протоколы
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return { valid: false, error: 'Недопустимый протокол. Используйте HTTP или HTTPS.' };
            }
            
            // Проверяем домен
            if (!urlObj.hostname) {
                return { valid: false, error: 'Некорректный URL.' };
            }
            
            // Проверяем распространенные RSS пути
            const path = urlObj.pathname.toLowerCase();
            const commonRssPaths = ['/rss', '/feed', '/atom', '/xml', '.rss', '.xml'];
            const hasRssPath = commonRssPaths.some(prefix => path.includes(prefix));
            
            if (!hasRssPath) {
                console.log(`⚠️ URL может не быть RSS лентой: ${url}`);
            }
            
            return { valid: true };
        } catch (error) {
            return { valid: false, error: 'Некорректный формат URL.' };
        }
    }

    /** Тестирование RSS ленты */
    async testRssFeed(url) {
        try {
            console.log(`🔍 Тестируем RSS: ${url}`);
            
            const validation = this.validateRssUrl(url);
            if (!validation.valid) {
                return { 
                    success: false, 
                    error: validation.error 
                };
            }
            
            const feed = await this.parser.parseURL(url);
            
            if (!feed.items || feed.items.length === 0) {
                return { 
                    success: false, 
                    error: 'RSS лента не содержит постов или пуста.' 
                };
            }
            
            return {
                success: true,
                title: feed.title || 'Без названия',
                description: feed.description || 'Без описания',
                itemCount: feed.items.length,
                lastItem: feed.items[0] ? {
                    title: feed.items[0].title || 'Без названия',
                    date: feed.items[0].pubDate || feed.items[0].isoDate || 'Не указана'
                } : null
            };
            
        } catch (error) {
            console.error(`❌ Ошибка тестирования RSS ${url}:`, error.message);
            
            let userError = 'Неверный RSS URL или лента недоступна.';
            
            if (error.message.includes('404')) {
                userError = 'RSS лента не найдена (ошибка 404).';
            } else if (error.message.includes('403')) {
                userError = 'Доступ к RSS ленте запрещен (ошибка 403).';
            } else if (error.message.includes('timeout')) {
                userError = 'Превышено время ожидания ответа от RSS ленты.';
            } else if (error.message.includes('ENOTFOUND')) {
                userError = 'Домен не найден. Проверьте правильность URL.';
            } else if (error.message.includes('Unexpected token')) {
                userError = 'Некорректный формат RSS ленты.';
            }
            
            return { 
                success: false, 
                error: userError 
            };
        }
    }

    /** Обрабатывает все активные RSS ленты */
    async processAllFeeds() {
        try {
            console.log('🔄 Начинаем обработку RSS лент...');

            const channels = await Channel.find({
                'settings.autoPublish': true,
                'rssSources.isActive': true
            }).populate('owner');

            let totalProcessed = 0;
            let totalPublished = 0;
            let totalErrors = 0;

            for (const channel of channels) {
                try {
                    const result = await this.processChannelFeeds(channel);
                    totalProcessed++;
                    totalPublished += result.published;
                    totalErrors += result.errors;
                } catch (error) {
                    console.error(`❌ Ошибка обработки канала ${channel.title}:`, error);
                    totalErrors++;
                }
            }

            console.log(`✅ Обработано ${totalProcessed} каналов, опубликовано ${totalPublished} постов, ошибок: ${totalErrors}`);
            return { 
                processed: totalProcessed, 
                published: totalPublished,
                errors: totalErrors 
            };
        } catch (error) {
            console.error('❌ Ошибка в processAllFeeds:', error);
            throw error;
        }
    }

    /** Обрабатывает RSS ленты конкретного канала */
    async processChannelFeeds(channel) {
        let publishedCount = 0;
        let errorCount = 0;

        for (const rssSource of channel.rssSources) {
            if (!rssSource.isActive) continue;

            try {
                const result = await this.processSingleFeed(channel, rssSource);
                publishedCount += result.published;
                
                // Если произошла ошибка парсинга, увеличиваем счетчик ошибок
                if (result.error) {
                    errorCount++;
                    
                    // Если много ошибок подряд, деактивируем источник
                    rssSource.errorCount = (rssSource.errorCount || 0) + 1;
                    if (rssSource.errorCount >= 5) {
                        rssSource.isActive = false;
                        console.log(`🚫 RSS источник деактивирован из-за множественных ошибок: ${rssSource.url}`);
                    }
                } else {
                    // Сбрасываем счетчик ошибок при успешной обработке
                    rssSource.errorCount = 0;
                }
                
                await channel.save();
                
            } catch (error) {
                console.error(`❌ Критическая ошибка обработки RSS ${rssSource.url}:`, error);
                errorCount++;
            }
        }

        return { 
            published: publishedCount, 
            errors: errorCount 
        };
    }

    /** Обрабатывает одну RSS ленту */
    async processSingleFeed(channel, rssSource) {
        try {
            console.log(`📡 Обрабатываем RSS: ${rssSource.url}`);

            const feed = await this.parser.parseURL(rssSource.url);
            let published = 0;

            if (!feed.items || feed.items.length === 0) {
                console.log(`ℹ️ RSS лента пуста: ${rssSource.url}`);
                return { published: 0, error: true };
            }

            // Сортируем по дате (новые сначала)
            const items = feed.items
                .filter(item => item.isoDate || item.pubDate)
                .sort((a, b) => new Date(b.isoDate || b.pubDate) - new Date(a.isoDate || a.pubDate))
                .slice(0, 10); // Берем последние 10 постов

            for (const item of items) {
                // Проверяем, не обрабатывали ли уже этот пост
                const itemDate = new Date(item.isoDate || item.pubDate);
                if (rssSource.lastProcessed && itemDate <= new Date(rssSource.lastProcessed)) {
                    continue;
                }

                // Проверяем ключевые слова
                if (!this.checkKeywords(item, rssSource)) {
                    continue;
                }

                // Проверяем лимиты пользователя
                const canPost = await UserService.canUserPost(channel.owner);
                if (!canPost) {
                    console.log(`⏸️ Достигнут лимит постов для пользователя ${channel.owner.telegramId}`);
                    break;
                }

                // Создаем и публикуем пост
                const postPublished = await this.createAndPublishPost(channel, item);
                if (postPublished) {
                    published++;
                    
                    // Обновляем счетчики
                    await UserService.incrementPostCount(channel.owner._id);
                    channel.statistics.totalPosts += 1;
                    channel.statistics.lastPostDate = new Date();
                }

                // Ждем между постами
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Обновляем время последней обработки
            rssSource.lastProcessed = new Date();
            await channel.save();

            console.log(`✅ Опубликовано ${published} постов из ${rssSource.url}`);
            return { published };

        } catch (error) {
            console.error(`❌ Ошибка парсинга RSS ${rssSource.url}:`, error.message);
            
            // Возвращаем информацию об ошибке
            return { 
                published: 0, 
                error: true,
                errorMessage: this.getUserFriendlyError(error)
            };
        }
    }

    /** Получает понятное пользователю сообщение об ошибке */
    getUserFriendlyError(error) {
        const message = error.message || error.toString();
        
        if (message.includes('404')) return 'RSS лента не найдена (404)';
        if (message.includes('403')) return 'Доступ запрещен (403)';
        if (message.includes('timeout')) return 'Превышено время ожидания';
        if (message.includes('ENOTFOUND')) return 'Домен не найден';
        if (message.includes('Unexpected token')) return 'Некорректный формат RSS';
        if (message.includes('Invalid URI')) return 'Некорректный URL';
        if (message.includes('Status code 4')) return 'Ошибка доступа к ленте';
        if (message.includes('Status code 5')) return 'Ошибка сервера RSS';
        
        return 'Неверный RSS URL или лента недоступна';
    }

    /** Проверяет ключевые слова */
    checkKeywords(item, rssSource) {
        const content = `${item.title || ''} ${item.contentSnippet || ''} ${item.description || ''}`.toLowerCase();
        
        if (!content.trim()) return true; // Если контента нет, пропускаем проверку

        // Проверяем исключающие ключевые слова
        if (rssSource.excludeKeywords && rssSource.excludeKeywords.length > 0) {
            const hasExcluded = rssSource.excludeKeywords.some(keyword =>
                keyword && content.includes(keyword.toLowerCase())
            );
            if (hasExcluded) return false;
        }

        // Проверяем включающие ключевые слова
        if (rssSource.includeKeywords && rssSource.includeKeywords.length > 0) {
            const hasIncluded = rssSource.includeKeywords.some(keyword =>
                keyword && content.includes(keyword.toLowerCase())
            );
            if (!hasIncluded) return false;
        }

        return true;
    }

    /** Создает и публикует пост в зависимости от режима канала */
    async createAndPublishPost(channel, rssItem) {
        try {
            let postContent = '';
            let imageUrl = null;

            // Определяем режим работы канала
            switch (channel.settings.mode) {
                case 'rss':
                    postContent = this.formatRssPost(rssItem, channel);
                    break;
                    
                case 'ai':
                    postContent = await this.generateAIPost(rssItem, channel);
                    break;
                    
                case 'combined':
                    const aiContent = await this.generateAIPost(rssItem, channel);
                    postContent = aiContent || this.formatRssPost(rssItem, channel);
                    break;
                    
                default:
                    postContent = this.formatRssPost(rssItem, channel);
            }

            // Если контент пустой, пропускаем
            if (!postContent || postContent.trim().length < 10) {
                console.log('ℹ️ Пропускаем пост: слишком короткий контент');
                return false;
            }

            // Получаем URL изображения если нужно
            if (channel.settings.postSettings.includeImages) {
                imageUrl = this.extractImageUrl(rssItem);
            }

            // Публикуем в канал
            await this.publishToTelegram(channel, postContent, imageUrl);
            return true;

        } catch (error) {
            console.error('❌ Ошибка создания поста:', error);
            return false;
        }
    }

    /** Форматирует RSS пост */
    formatRssPost(item, channel) {
        try {
            let content = '';
            
            // Добавляем заголовок
            if (item.title) {
                content += `📰 ${item.title}\n\n`;
            }

            // Добавляем описание
            const description = item.contentSnippet || item.description || '';
            if (description) {
                const maxLength = channel.settings.postSettings.maxLength - 200; // Оставляем место для хештегов
                const truncated = description.length > maxLength ? 
                    description.substring(0, maxLength) + '...' : description;
                content += `${truncated}\n\n`;
            }

            // Добавляем хештеги если включено
            if (channel.settings.postSettings.addHashtags) {
                content += `#новости #автопостинг\n`;
            }

            // Добавляем водяной знак если есть
            if (channel.settings.postSettings.watermark) {
                content += `\n${channel.settings.postSettings.watermark}`;
            }

            // Добавляем ссылку на источник
            if (item.link) {
                content += `\n\n🔗 Источник: ${item.link}`;
            }

            return content.trim();
        } catch (error) {
            console.error('❌ Ошибка форматирования RSS поста:', error);
            return '❌ Ошибка при создании поста';
        }
    }

    /** Генерирует AI пост на основе RSS новости */
    async generateAIPost(rssItem, channel) {
        try {
            const prompt = `
На основе этой новости создай интересный пост для Telegram канала:

Заголовок: ${rssItem.title || 'Без заголовка'}
Описание: ${rssItem.contentSnippet || rssItem.description || 'Нет описания'}

Требования:
- Стиль: ${channel.aiSettings.tone}
- Темы: ${channel.aiSettings.topics?.join(', ') || 'новости'}
- Максимальная длина: ${channel.settings.postSettings.maxLength} символов
- Добавь релевантные хештеги
- Сделай текст engaging и интересным

Создай пост:`;

            const aiPost = await AIService.generatePost(prompt, channel.aiSettings.tone);
            return aiPost;

        } catch (error) {
            console.error('❌ Ошибка AI генерации:', error);
            return null;
        }
    }

    /** Извлекает URL изображения из RSS элемента */
    extractImageUrl(item) {
        try {
            // Пробуем разные источники изображений
            if (item.enclosure && item.enclosure.type?.startsWith('image/')) {
                return item.enclosure.url;
            }
            
            if (item.mediaContent && item.mediaContent.$.url) {
                return item.mediaContent.$.url;
            }
            
            // Парсим HTML контент для поиска изображений
            const htmlContent = item['content:encoded'] || item.content || '';
            if (htmlContent) {
                const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/i);
                if (imgMatch) return imgMatch[1];
            }
            
            return null;
        } catch (error) {
            console.error('❌ Ошибка извлечения изображения:', error);
            return null;
        }
    }

    /** Публикует пост в Telegram канал */
    async publishToTelegram(channel, content, imageUrl = null) {
        try {
            // Обрезаем контент если превышает лимит Telegram
            if (content.length > 4096) {
                content = content.substring(0, 4000) + '...';
            }

            const telegram = require('../bot');

            const parseMode = channel.settings.postSettings.parseMode === 'Markdown' ? 'Markdown' : 'HTML';

            if (imageUrl) {
                // Публикуем с изображением
                await telegram.telegram.sendPhoto(channel.channelId, imageUrl, {
                    caption: content,
                    parse_mode: parseMode
                });
            } else {
                // Публикуем только текст
                await telegram.telegram.sendMessage(channel.channelId, content, {
                    parse_mode: parseMode
                });
            }

            console.log(`✅ Опубликован пост в канале ${channel.title}`);
            return true;

        } catch (error) {
            console.error(`❌ Ошибка публикации в канал ${channel.title}:`, error);

            // Если бот удален из канала, деактивируем автопостинг
            if (error.description?.includes('bot was kicked') || 
                error.description?.includes('chat not found') ||
                error.description?.includes('chat_not_found')) {
                channel.settings.autoPublish = false;
                await channel.save();
                console.log(`🚫 Бот удален из канала ${channel.title}, автопостинг отключен`);
            }

            return false;
        }
    }
}

module.exports = new RssService();