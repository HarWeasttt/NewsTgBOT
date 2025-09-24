const mongoose = require('mongoose');

const promptSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  query: {
    type: String,
    required: true,
    trim: true
  },
  keywordsToExclude: [String],
  language: { 
    type: String, 
    default: 'ru' 
  },
  owner: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

promptSchema.index({ owner: 1 });
promptSchema.index({ query: 1 });

module.exports = mongoose.model('Prompt', promptSchema);