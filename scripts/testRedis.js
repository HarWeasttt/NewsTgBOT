const Redis = require('ioredis');
const { BOT_CONFIG } = require('../config');

async function testRedis() {
  console.log('🔍 Testing Redis connection...');
  
  const redis = new Redis(BOT_CONFIG.REDIS_URL, {
    maxRetriesPerRequest: 1, // Уменьшаем для теста
    connectTimeout: 5000,
    lazyConnect: true
  });

  try {
    await redis.connect();
    console.log('✅ Redis connected successfully!');
    
    // Тестируем базовые операции
    await redis.set('test', 'hello');
    const value = await redis.get('test');
    console.log('✅ Redis operations work:', value);
    
    await redis.del('test');
    console.log('✅ Redis test completed successfully!');
    
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.log('\n💡 Solutions:');
    console.log('1. Make sure Redis server is running');
    console.log('2. Check REDIS_URL in .env file');
    console.log('3. If using Docker: docker run -p 6379:6379 redis');
  } finally {
    await redis.quit();
  }
}

testRedis();