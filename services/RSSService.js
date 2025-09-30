const Parser = require('rss-parser');
const axios = require('axios');
const Channel = require('../models/Channel');
const PostQueue = require('../queues/PostQueue');
const AIService = require('./AIService');

class RSSService {
  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['description', 'description']
        ]
      }
    });
  }

  async parseFeed(url) {
    try {
      const feed = await this.parser.parseURL(url);
      return feed;
    } catch (error) {
      console.error(`RSS parsing error for ${url}:`, error);
      throw new Error('Не удалось прочитать RSS ленту');
    }
  }

  async processChannelFeeds() {
    const channels = await Channel.find({
      'settings.autoPublish': true,
      'rssSources.isActive': true
    }).populate('owner');

    for (const channel of channels) {
      for (const source of channel.rssSources) {
        if (!source.isActive) continue;

        try {
          const feed = await this.parseFeed(source.url);
          await this.processFeedItems(feed, channel, source);
        } catch (error) {
          console.error(`Error processing feed for channel ${channel.title}:`, error);
        }
      }
    }
  }

  async processFeedItems(feed, channel, source) {
    const latestItems = feed.items.slice(0, 5); // Берем 5 последних статей

    for (const item of latestItems) {
      // Проверяем, не публиковали ли мы уже эту статью
      if (source.lastItemUrl === item.link) {
        continue;
      }

      // Фильтрация по ключевым словам
      if (!this.passesFilters(item, source)) {
        continue;
      }

      // Проверяем лимиты пользователя
      if (!await this.checkUserLimits(channel.owner)) {
        console.log(`User ${channel.owner.telegramId} reached daily limit`);
        break;
      }

      // Создаем пост в зависимости от режима канала
      await this.createPostFromItem(item, channel, source);
      
      // Обновляем последнюю обработанную ссылку
      source.lastItemUrl = item.link;
      await channel.save();
      
      break; // Обрабатываем по одной статье за раз
    }
  }

  passesFilters(item, source) {
    const content = `${item.title} ${item.contentSnippet || ''}`.toLowerCase();
    
    // Проверка включающих ключевых слов
    if (source.includeKeywords.length > 0) {
      const hasIncludeKeyword = source.includeKeywords.some(keyword =>
        content.includes(keyword.toLowerCase())
      );
      if (!hasIncludeKeyword) return false;
    }
    
    // Проверка исключающих ключевых слов
    if (source.excludeKeywords.length > 0) {
      const hasExcludeKeyword = source.excludeKeywords.some(keyword =>
        content.includes(keyword.toLowerCase())
      );
      if (hasExcludeKeyword) return false;
    }
    
    return true;
  }

  async checkUserLimits(user) {
    const UserService = require('./UserService');
    return await UserService.canUserPost(user);
  }

  async createPostFromItem(item, channel, source) {
    let postContent = '';
    
    switch (channel.settings.mode) {
      case 'rss':
        postContent = this.formatRSSPost(item);
        break;
        
      case 'ai':
        postContent = await AIService.generatePostFromRSS(
          item.title,
          item.contentSnippet || item.content,
          channel.aiSettings.tone
        );
        break;
        
      case 'combined':
        const aiContent = await AIService.generatePostFromRSS(
          item.title,
          item.contentSnippet || item.content,
          channel.aiSettings.tone
        );
        postContent = `${this.formatRSSPost(item)}\n\n🤖 AI-анализ:\n${aiContent}`;
        break;
    }

    // Добавляем в очередь на публикацию
    await PostQueue.add('publish-post', {
      channelId: channel.telegramId,
      content: postContent,
      userId: channel.owner._id
    });

    // Обновляем счетчик постов
    const UserService = require('./UserService');
    await UserService.incrementPostCount(channel.owner);
  }

  formatRSSPost(item) {
    return `📰 ${item.title}\n\n${item.contentSnippet || ''}\n\n🔗 ${item.link}`;
  }
}

module.exports = new RSSService();