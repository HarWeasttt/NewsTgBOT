const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function startRedis() {
  console.log('🐳 Starting Redis with Docker...');
  
  // Проверяем установлен ли Docker
  exec('docker --version', (error) => {
    if (error) {
      console.error('❌ Docker is not installed or not running');
      console.log('\n💡 Please install Docker:');
      console.log('   Windows: https://docs.docker.com/desktop/install/windows-install/');
      console.log('   macOS: https://docs.docker.com/desktop/install/mac-install/');
      console.log('   Linux: https://docs.docker.com/engine/install/');
      return;
    }

    // Проверяем существует ли docker-compose.yml
    const composeFile = path.join(__dirname, '../docker-compose.yml');
    if (!fs.existsSync(composeFile)) {
      console.error('❌ docker-compose.yml not found');
      return;
    }

    // Запускаем Redis
    exec('docker-compose up -d redis', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Failed to start Redis:', error.message);
        return;
      }
      
      console.log('✅ Redis started successfully!');
      console.log('📊 Redis is running on: localhost:6379');
      console.log('🎯 Update your .env file:');
      console.log('   REDIS_URL=redis://localhost:6379');
      
      // Проверяем статус
      setTimeout(() => {
        exec('docker-compose ps', (error, stdout) => {
          if (!error) {
            console.log('\n📦 Container status:');
            console.log(stdout);
          }
        });
      }, 2000);
    });
  });
}

startRedis();