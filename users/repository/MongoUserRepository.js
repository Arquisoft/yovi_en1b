const UserRepository = require('./UserRepository');
const User = require('../models/user');
const Game = require('../models/game');

const LEADERBOARD_SIZE = 10;

// Internal mapping to ensure display names from the UI map to DB keys
const STRATEGY_MAP = {
  'monte carlo': 'mcts',
  'ai (gemini)': 'ai',
  'ai':          'ai',
  'mcts':        'mcts',
  'random':      'random',
  'defensive':   'defensive'
};

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
    // 1. Map strategy to internal ID (e.g., 'Monte Carlo' -> 'mcts')
    const internalStrategy = STRATEGY_MAP[strategy?.toLowerCase()] || (strategy || 'random').toLowerCase();

    // 2. Determine increment values based on the result
    const increments = {
      wins:   result === 'WIN'  ? 1 : 0,
      losses: result === 'LOSS' ? 1 : 0,
      surrendered: result === 'SURRENDERED' ? 1 : 0
    };

    // 3. Initialize the update object with total game increments
    const update = {
      $inc: {
        'statistics.total_games': 1,
        'statistics.total_wins':   increments.wins,
        'statistics.total_losses': increments.losses,
        'statistics.total_surrendered': increments.surrendered
      }
    };

    // 4. Determine the specific path (vs_player or vs_bot.<internalStrategy>)
    const categoryPath = type === 'PLAYER'
        ? 'vs_player'
        : `vs_bot.${internalStrategy}`;

    // 5. Apply the same increments to the category-specific path
    update.$inc[`statistics.${categoryPath}.wins`]   = increments.wins;
    update.$inc[`statistics.${categoryPath}.losses`] = increments.losses;
    update.$inc[`statistics.${categoryPath}.surrendered`]  = increments.surrendered;

    return await User.findByIdAndUpdate(userId, update, { new: true });
  }

  async getLeaderboard() {
    const [overall, random, defensive, mcts, ai] = await Promise.all([
      User.find().sort({ 'statistics.total_wins': -1 }).limit(LEADERBOARD_SIZE).select('username statistics.total_wins statistics.total_games').lean(),
      User.find().sort({ 'statistics.vs_bot.random.wins': -1 }).limit(LEADERBOARD_SIZE).select('username statistics.vs_bot.random').lean(),
      User.find().sort({ 'statistics.vs_bot.defensive.wins': -1 }).limit(LEADERBOARD_SIZE).select('username statistics.vs_bot.defensive').lean(),
      User.find().sort({ 'statistics.vs_bot.mcts.wins': -1 }).limit(LEADERBOARD_SIZE).select('username statistics.vs_bot.mcts').lean(),
      User.find().sort({ 'statistics.vs_bot.ai.wins': -1 }).limit(LEADERBOARD_SIZE).select('username statistics.vs_bot.ai').lean(),
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