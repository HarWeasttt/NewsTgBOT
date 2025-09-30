require('dotenv').config();
const PostQueue = require('../queues/PostQueue');

async function checkQueue() {
  try {
    const stats = await PostQueue.getQueueStats();
    console.log('📊 Queue Statistics:');
    console.log('====================');
    console.log(`Waiting: ${stats.waiting}`);
    console.log(`Active: ${stats.active}`);
    console.log(`Completed: ${stats.completed}`);
    console.log(`Failed: ${stats.failed}`);
    console.log(`Delayed: ${stats.delayed}`);
    
    if (stats.waiting > 0) {
      console.log('\n⏳ Waiting jobs:');
      const jobs = await PostQueue.queue.getWaiting();
      jobs.forEach(job => {
        console.log(`- Job ${job.id}: ${job.data.channelId}`);
      });
    }
    
  } catch (error) {
    console.error('Error checking queue:', error);
  } finally {
    process.exit();
  }
}

checkQueue();