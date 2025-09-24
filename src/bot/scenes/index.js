const { Scenes: { Stage } } = require('telegraf');
const addChannelScene = require('./addChannelScene');
const addPromptScene = require('./addPromptScene');
const scheduleScene = require('./scheduleScene');

const stage = new Stage([
  addChannelScene,
  addPromptScene,
  scheduleScene
]);

module.exports = stage;