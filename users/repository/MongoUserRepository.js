const UserRepository = require('./UserRepository');
const User = require('../models/User');
const Game = require('../models/Game');

class MongoUserRepository extends UserRepository {
    async findByUsername(username) {
        return await User.findOne({ username });
    }

    async findById(id) {
        return await User.findById(id);
    }

    async create(userData) {
        return await new User(userData).save();
    }

    async findGamesByPlayer(playerId) {
        return await Game.find({ player_id: playerId }).select('-moves').sort({ created_at: -1 });
    }

    async createGame(gameData) {
        return await new Game(gameData).save();
    }

    async findGameById(id) {
        return await Game.findById(id);
    }

    async updateGame(id, data) {
        return await Game.findByIdAndUpdate(id, data, { new: true });
    }

    async updateStats(userId, { result, type, difficulty }) {
        const update = { $inc: { 'statistics.total_games': 1 } };
        const winIncr = result === 'WIN' ? 1 : 0;
        const lossIncr = result === 'LOSS' ? 1 : 0;

        update.$inc['statistics.total_wins'] = winIncr;
        update.$inc['statistics.total_losses'] = lossIncr;

        if (type === 'PLAYER') {
            update.$inc['statistics.vs_player.wins'] = winIncr;
            update.$inc['statistics.vs_player.losses'] = lossIncr;
        } else {
            update.$inc[`statistics.vs_bot.${difficulty.toLowerCase()}.wins`] = winIncr;
            update.$inc[`statistics.vs_bot.${difficulty.toLowerCase()}.losses`] = lossIncr;
        }
        return await User.findByIdAndUpdate(userId, update, { new: true });
    }
}
module.exports = MongoUserRepository;