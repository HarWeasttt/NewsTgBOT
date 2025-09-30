const OpenAI = require('openai');
const { BOT_CONFIG, AI_TONES } = require('../config');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: BOT_CONFIG.OPENAI_API_KEY,
    });
    this.usageStats = {
      totalRequests: 0,
      totalCost: 0,
      todayRequests: 0
    };
  }

  async generatePost(topic, style = 'professional', tone = 'neutral') {
    try {
      const prompt = this.buildPrompt(topic, style, tone);
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Ты профессиональный копирайтер, который создает engaging посты для социальных сетей. Создавай уникальный, интересный контент."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });
      
      this.usageStats.totalRequests++;
      this.usageStats.todayRequests++;
      
      return completion.choices[0]?.message?.content || 'Не удалось сгенерировать контент.';
    } catch (error) {
      console.error('AI Generation error:', error);
      return 'Произошла ошибка при генерации контента. Попробуйте позже.';
    }
  }

  buildPrompt(topic, style, tone) {
    const stylePrompts = {
      professional: "Создай профессиональный пост в деловом стиле",
      humorous: "Создай юмористический пост с шутками и иронией",
      news: "Создай новостной пост в стиле журналистики",
      advertising: "Создай рекламный пост с призывом к действию",
      educational: "Создай образовательный пост с полезной информацией"
    };
    
    const tonePrompts = {
      formal: "Используй формальный тон",
      informal: "Используй неформальный, дружеский тон",
      enthusiastic: "Используй восторженный, энергичный тон",
      calm: "Используй спокойный, уравновешенный тон"
    };
    
    return `${stylePrompts[style] || stylePrompts.professional}. 
    ${tonePrompts[tone] || tonePrompts.formal}.
    
    Тема: ${topic}
    
    Требования:
    - Длина: 2-3 абзаца
    - Используй эмодзи где уместно
    - Сделай текст engaging и интересным
    - Добавь призыв к действию в конце
    - Не используй markdown разметку`;
  }

  getUsageStats() {
    return this.usageStats;
  }

  resetDailyStats() {
    this.usageStats.todayRequests = 0;
  }
}

module.exports = new AIService();