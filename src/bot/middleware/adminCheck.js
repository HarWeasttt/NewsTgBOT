const adminCheck = async (ctx, next) => {
    if (!ctx.session.user || !ctx.session.user.isAdmin) {
      return await ctx.reply('❌ У вас нет прав доступа к этой команде.');
    }
    
    await next();
  };
  
  module.exports = adminCheck;