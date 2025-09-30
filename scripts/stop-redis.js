const { exec } = require('child_process');

function stopRedis() {
  console.log('🛑 Stopping Redis...');
  
  exec('docker-compose down', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Failed to stop Redis:', error.message);
      return;
    }
    
    console.log('✅ Redis stopped successfully!');
    console.log(stdout);
  });
}

stopRedis();