const mongoose = require('mongoose');

const moveSchema = new mongoose.Schema({
  move_number: { type: Number, required: true },
  player:      { type: String, required: true },
  coordinates: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    z: { type: Number, required: true }
  },
  yen_state:   { type: String },
  created_at:  { type: Date, default: Date.now }
}, { _id: false });

const gameSchema = new mongoose.Schema({
  player_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  game_type:        { type: String, enum: ['BOT', 'PLAYER'], default: 'BOT' },
  board_size:       { type: Number, required: true },
  strategy:         { type: String, default: 'random' },
  difficulty_level: { type: String, default: 'medium' },
  status:           { type: String, enum: ['IN_PROGRESS', 'FINISHED'], default: 'IN_PROGRESS' },
  result:           { type: String, enum: ['WIN', 'LOSS', null], default: null },
  duration_seconds: { type: Number, default: 0 },
  yen_final_state:  { type: String },
  created_at:       { type: Date, default: Date.now },
  moves:            [moveSchema]
});

module.exports = mongoose.model('Game', gameSchema);