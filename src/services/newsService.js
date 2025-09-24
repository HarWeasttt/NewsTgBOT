const NewsAPI = require('newsapi');
const config = require('../../config');
const logger = require('../utils/logger');

class NewsService {
  constructor() {
    this.newsapi = new NewsAPI(config.news.apiKey);
    this.cache = new Map();
  }

  async getNewsByQuery(query, options = {}) {
    const cacheKey = `${query}-${options.language}`;
    
    // Проверка кэша (5 минут)
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) {
        return cached.data;
      }
    }

    try {
      const params = {
        q: query,
        language: options.language || 'ru',
        sortBy: 'publishedAt',
        pageSize: options.limit || 10
      };

      if (options.from) params.from = options.from;
      if (options.to) params.to = options.to;

      const response = await this.newsapi.v2.everything(params);
      
      // Кэширование результатов
      this.cache.set(cacheKey, {
        data: response.articles,
        timestamp: Date.now()
      });

      logger.info(`News fetched for query: "${query}", results: ${response.articles.length}`);
      return response.articles;

    } catch (error) {
      logger.error('NewsAPI error:', error);
      
      if (error.message.includes('rate limited')) {
        throw new Error('Превышен лимит запросов к NewsAPI. Попробуйте позже.');
      }
      
      return [];
    }
  }

  filterArticles(articles, excludeKeywords = []) {
    if (!excludeKeywords.length) return articles;

    return articles.filter(article => {
      const title = article.title?.toLowerCase() || '';
      const description = article.description?.toLowerCase() || '';
      const content = article.content?.toLowerCase() || '';

      const text = `${title} ${description} ${content}`;

      return !excludeKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );
    });
  }

  pickRandomArticle(articles) {
    if (!articles.length) return null;
    
    // Предпочтение более свежим новостям
    const recentArticles = articles
      .filter(article => {
        const articleDate = new Date(article.publishedAt);
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return articleDate > dayAgo;
      });

    const targetArray = recentArticles.length > 0 ? recentArticles : articles;
    return targetArray[Math.floor(Math.random() * targetArray.length)];
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = new NewsService();