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
    name_of_enemy:      { type: String, default: null }, // name of local enemy if game_type is PLAYER
    board_size:         { type: Number, required: true },
    strategy:           { type: String, default: 'random' },
    difficulty_level:   { type: String, default: 'easy' },
    variants:           { type: [String], default: [] },  // e.g. ['Explosions']
    // Initial YEN layout string — populated at game creation time for variants
    // that need pre-placed pieces (Explosions puts one bomb on the board at
    // random before the first move so the player can see it). Empty for plain
    // games.
    initial_yen_state:  { type: String, default: null },
    current_turn:       { type: String, enum: ['B', 'R'], required: true },
    status:             { type: String, enum: ['IN_PROGRESS', 'FINISHED'], default: 'IN_PROGRESS' },
    result:             { type: String, enum: ['WIN', 'LOSS', 'UNFINISHED', null], default: null },
    duration_seconds:   { type: Number, default: 0 },
    yen_final_state:    { type: String },
    created_at:         { type: Date, default: Date.now },
    moves:              [moveSchema]
});

module.exports = mongoose.model('Game', gameSchema);