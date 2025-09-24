class Helpers {
    static formatPost(template, article) {
      return template
        .replace(/{title}/g, article.title || '')
        .replace(/{summary}/g, article.description || article.content || 'Нет описания')
        .replace(/{source}/g, article.source?.name || 'Неизвестный источник')
        .replace(/{source_link}/g, article.url || '')
        .replace(/{date}/g, new Date(article.publishedAt).toLocaleDateString('ru-RU'))
        .replace(/{time}/g, new Date(article.publishedAt).toLocaleTimeString('ru-RU'));
    }
  
    static generateRandomTimeSlots(postsPerDay, fromHour = 9, toHour = 21) {
      const slots = [];
      const interval = Math.floor((toHour - fromHour) * 60 / postsPerDay);
      
      for (let i = 0; i < postsPerDay; i++) {
        const minutes = fromHour * 60 + i * interval + Math.floor(Math.random() * interval / 2);
        const hour = Math.floor(minutes / 60);
        const minute = minutes % 60;
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
      
      return slots;
    }
  
    static validateChannelRights(bot, channelId) {
      return bot.telegram.getChatMember(channelId, bot.botInfo.id)
        .then(member => {
          return member.status === 'administrator' && member.can_post_messages;
        })
        .catch(() => false);
    }
  
    static formatSubscriptionDate(date) {
      return new Date(date).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }
  
  module.exports = Helpers;