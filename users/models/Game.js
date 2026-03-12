const mongoose = require('mongoose');

const moveSchema = new mongoose.Schema({
    move_number:  { type: Number, required: true },
    player:       { type: String, enum: ['B', 'R'], required: true },
    coordinates: {
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        z: { type: Number, required: true }
    },
    yen_state:    { type: String },
    created_at:   { type: Date, default: Date.now }
}, { _id: false });

const gameSchema = new mongoose.Schema({
    player_id:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    game_type:          { type: String, enum: ['BOT', 'PLAYER'], default: 'BOT' },
    name_of_enemy:      { type: String, default: null },    // name of local enemy if game_type is PLAYER
    board_size:         { type: Number, required: true },
    strategy:           { type: String, default: 'random' },
    difficulty_level:   { type: String, default: 'medium' },
    current_turn:       { type: String, enum: ['B', 'R'], required: true }, // whose turn it is
    status:             { type: String, enum: ['IN_PROGRESS', 'FINISHED'], default: 'IN_PROGRESS' },
    result:             { type: String, enum: ['WIN', 'LOSS', 'DRAW', null], default: null },
    // DRAW is used when a user quits the game before it finishes
    duration_seconds:   { type: Number, default: 0 },
    yen_final_state:    { type: String },
    created_at:         { type: Date, default: Date.now },
    moves:              [moveSchema]
});

module.exports = mongoose.model('Game', gameSchema);