const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function backupDatabase() {
  const backupDir = 'backups';
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `backup-${timestamp}.gz`);
  
  return new Promise((resolve, reject) => {
    exec(`mongodump --uri="${process.env.MONGODB_URI}" --archive=${backupFile} --gzip`, 
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          console.log(`✅ Backup created: ${backupFile}`);
          resolve(backupFile);
        }
      }
    );
  });
}

// Автоматическое удаление старых бэкапов
function cleanupOldBackups() {
  const backupDir = 'backups';
  const files = fs.readdirSync(backupDir)
    .map(file => ({ file, time: fs.statSync(path.join(backupDir, file)).mtime.getTime() }))
    .sort((a, b) => b.time - a.time);
  
  // Оставляем только последние 10 бэкапов
  files.slice(10).forEach(({ file }) => {
    fs.unlinkSync(path.join(backupDir, file));
    console.log(`🗑 Deleted old backup: ${file}`);
  });
}