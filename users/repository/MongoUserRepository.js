const UserRepository = require('./UserRepository');
const User = require('../models/user');
const Game = require('../models/game');

const LEADERBOARD_SIZE = 10;

class MongoUserRepository extends UserRepository {

  async findByUsername(username) {
    return await User.findOne({ username: String(username) });
  }

  async findById(id) {
    return await User.findById(id).select('-password_hash');
  }

  async create(userData) {
    const user = new User(userData);
    return await user.save();
  }

  async usernameExists(username) {
    const user = await User.findOne({ username: String(username) }).select('_id');
    return !!user;
  }

  async findGamesByPlayer(playerId) {
    return await Game.find({ player_id: playerId }).select('-moves').sort({ created_at: -1 });
  }

  async createGame(gameData) {
    const game = new Game(gameData);
    return await game.save();
  }

  async findGameById(id) {
    return await Game.findById(id);
  }

  async updateGame(id, data) {
    return await Game.findByIdAndUpdate(id, data, { new: true });
  }

  async updateStats(userId, { result, type, strategy }) {
    const update = { $inc: { 'statistics.total_games': 1 } };

    const winIncr  = result === 'WIN'  ? 1 : 0;
    const lossIncr = result === 'LOSS' ? 1 : 0;
    const drawIncr = result === 'DRAW' ? 1 : 0;

    if (type === 'PLAYER') {
      update.$inc['statistics.vs_player.wins']   = winIncr;
      update.$inc['statistics.vs_player.losses'] = lossIncr;
      update.$inc['statistics.vs_player.draws']  = drawIncr;
    } else {
      const stratKey = strategy?.toLowerCase() || 'random';
      update.$inc[`statistics.vs_bot.${stratKey}.wins`]   = winIncr;
      update.$inc[`statistics.vs_bot.${stratKey}.losses`] = lossIncr;
      update.$inc[`statistics.vs_bot.${stratKey}.draws`]  = drawIncr;
    }

    return await User.findByIdAndUpdate(userId, update, { new: true });
  }

  /**
   * .lean() returns plain JS objects instead of Mongoose documents — faster for read-only queries
   */
  async getLeaderboard() {
    const [overall, random, defensive, mcts, ai] = await Promise.all([
      User.find()
          .sort({ 'statistics.total_wins': -1 })
          .limit(LEADERBOARD_SIZE)
          .select('username statistics.total_wins statistics.total_games')
          .lean(),

      User.find()
          .sort({ 'statistics.vs_bot.random.wins': -1 })
          .limit(LEADERBOARD_SIZE)
          .select('username statistics.vs_bot.random')
          .lean(),

      User.find()
          .sort({ 'statistics.vs_bot.defensive.wins': -1 })
          .limit(LEADERBOARD_SIZE)
          .select('username statistics.vs_bot.defensive')
          .lean(),

      User.find()
          .sort({ 'statistics.vs_bot.mcts.wins': -1 })
          .limit(LEADERBOARD_SIZE)
          .select('username statistics.vs_bot.mcts')
          .lean(),

      User.find()
          .sort({ 'statistics.vs_bot.ai.wins': -1 })
          .limit(LEADERBOARD_SIZE)
          .select('username statistics.vs_bot.ai')
          .lean(),
    ]);

    return {
      overall: overall.map(u => ({
        username:    u.username,
        total_wins:  u.statistics.total_wins,
        total_games: u.statistics.total_games
      })),
      vs_bots: {
        random:    random.map(u =>    ({ username: u.username, wins: u.statistics?.vs_bot?.random?.wins    ?? 0 })),
        defensive: defensive.map(u => ({ username: u.username, wins: u.statistics?.vs_bot?.defensive?.wins ?? 0 })),
        mcts:      mcts.map(u =>      ({ username: u.username, wins: u.statistics?.vs_bot?.mcts?.wins      ?? 0 })),
        ai:        ai.map(u =>        ({ username: u.username, wins: u.statistics?.vs_bot?.ai?.wins        ?? 0 }))
      }
    };
  }
}

module.exports = MongoUserRepository;