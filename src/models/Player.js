const mongoose = require('mongoose');
const { Schema } = mongoose;

const playerSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  age: {
    type: Number,
    required: true,
    min: 0
  },
  role: {
    type: String,
    enum: ['player', 'gm', 'spectator'],
    default: 'player'
  },
  game: {
    type: Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  character: {
    type: Schema.Types.ObjectId,
    ref: 'Character'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp before saving
playerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Player', playerSchema);