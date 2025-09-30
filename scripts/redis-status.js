const { exec } = require('child_process');
const Redis = require('ioredis');

async function checkRedisStatus() {
  console.log('🔍 Checking Redis status...');
  
  // Проверяем контейнер
  exec('docker-compose ps', (error, stdout) => {
    if (error) {
      console.log('❌ Docker Compose not available');
      return;
    }
    
    console.log('🐳 Container status:');
    console.log(stdout);
  });

  // Проверяем соединение с Redis
  const redis = new Redis('redis://localhost:6379', {
    lazyConnect: true,
    connectTimeout: 5000
  });

  try {
    await redis.connect();
    console.log('✅ Redis connection: OK');
    
    // Тестируем операции
    await redis.set('test_key', 'hello_redis');
    const value = await redis.get('test_key');
    console.log('✅ Redis operations: OK');
    console.log(`   Test value: ${value}`);
    
    await redis.del('test_key');
    
    // Проверяем информацию о Redis
    const info = await redis.info();
    const lines = info.split('\n');
    const versionLine = lines.find(line => line.startsWith('redis_version'));
    const memoryLine = lines.find(line => line.startsWith('used_memory_human'));
    
    console.log(`📊 Redis version: ${versionLine ? versionLine.split(':')[1] : 'N/A'}`);
    console.log(`💾 Memory usage: ${memoryLine ? memoryLine.split(':')[1] : 'N/A'}`);
    
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
  } finally {
    await redis.quit();
  }
}

checkRedisStatus();