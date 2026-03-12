const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username:      { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    created_at:    { type: Date, default: Date.now },
    statistics: {
        total_games:  { type: Number, default: 0 },
        total_wins:   { type: Number, default: 0 },
        total_losses: { type: Number, default: 0 },
        vs_player: {
            wins:   { type: Number, default: 0 },
            losses: { type: Number, default: 0 }
        },
        vs_bot: {
            easy: {
                wins:   { type: Number, default: 0 },
                losses: { type: Number, default: 0 }
            },
            medium: {
                wins:   { type: Number, default: 0 },
                losses: { type: Number, default: 0 }
            },
            hard: {
                wins:   { type: Number, default: 0 },
                losses: { type: Number, default: 0 }
            }
        }
    }
});

module.exports = mongoose.model('User', userSchema);