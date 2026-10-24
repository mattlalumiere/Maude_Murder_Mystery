const mongoose = require('mongoose');
const { Schema } = mongoose;

const characterSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['victim', 'suspect', 'clue', 'alibi', 'alibi', 'secret', 'secret', 'secret'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  game: {
    type: Schema.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
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
characterSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Character', characterSchema);