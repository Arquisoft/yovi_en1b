const UserRepository = require('./UserRepository');
const User = require('../models/user');
const Game = require('../models/game');

/** Maximum number of entries returned per leaderboard category. */
const LEADERBOARD_SIZE = 10;

/**
 * Maps frontend display names and internal strategy identifiers (lowercased)
 * to the canonical DB keys used in the statistics.vs_bot subdocument.
 * Allows callers to pass either display names (e.g. 'Monte Carlo') or
 * internal ids (e.g. 'mcts') without needing to normalise beforehand.
 */
const STRATEGY_MAP = {
  'monte carlo': 'mcts',
  'ai (gemini)': 'ai',
  'ai':          'ai',
  'mcts':        'mcts',
  'random':      'random',
  'defensive':   'defensive'
};

/**
 * MongoDB-backed implementation of UserRepository.
 * Provides all data access operations for users and games,
 * using Mongoose models for User and Game.
 *
 * @extends UserRepository
 */
class MongoUserRepository extends UserRepository {

  /**
   * Finds a user by their username.
   * Returns the full user document including the password hash (used for login).
   *
   * @param {string} username - The username to search for.
   * @returns {Promise<object|null>} The user document, or null if not found.
   */
  async findByUsername(username) {
    return await User.findOne({ username: String(username) });
  }

  /**
   * Finds a user by their MongoDB ObjectId.
   * The password_hash field is excluded from the returned document.
   *
   * @param {string|mongoose.Types.ObjectId} id - The user's ObjectId.
   * @returns {Promise<object|null>} The user document without password_hash, or null if not found.
   */
  async findById(id) {
    return await User.findById(id).select('-password_hash');
  }

  /**
   * Creates and persists a new user document.
   *
   * @param {object} userData - Fields to populate the new user (username, password_hash, etc.).
   * @returns {Promise<object>} The saved user document.
   */
  async create(userData) {
    const user = new User(userData);
    return await user.save();
  }

  /**
   * Checks whether a username is already registered.
   * Only fetches the _id field for efficiency.
   *
   * @param {string} username - The username to check.
   * @returns {Promise<boolean>} True if the username exists, false otherwise.
   */
  async usernameExists(username) {
    const user = await User.findOne({ username: String(username) }).select('_id');
    return !!user;
  }

  /**
   * Returns all games played by a given user, sorted by creation date descending.
   * The moves array is excluded from each document to keep the response lightweight.
   *
   * @param {string|mongoose.Types.ObjectId} playerId - The user's ObjectId.
   * @returns {Promise<object[]>} Array of game documents without moves arrays.
   */
  async findGamesByPlayer(playerId) {
    return await Game.find({ player_id: playerId }).select('-moves').sort({ created_at: -1 });
  }

  /**
   * Creates and persists a new game document.
   *
   * @param {object} gameData - Fields to populate the new game.
   * @returns {Promise<object>} The saved game document.
   */
  async createGame(gameData) {
    const game = new Game(gameData);
    return await game.save();
  }

  /**
   * Finds a game by its MongoDB ObjectId.
   * Returns the full game document including the moves array.
   *
   * @param {string|mongoose.Types.ObjectId} id - The game's ObjectId.
   * @returns {Promise<object|null>} The game document, or null if not found.
   */
  async findGameById(id) {
    return await Game.findById(id);
  }

  /**
   * Applies a partial update to a game document and returns the updated version.
   *
   * @param {string|mongoose.Types.ObjectId} id   - The game's ObjectId.
   * @param {object} data - MongoDB update expression (e.g. { $set: { status: 'FINISHED' } }).
   * @returns {Promise<object|null>} The updated game document.
   */
  async updateGame(id, data) {
    return await Game.findByIdAndUpdate(id, data, { new: true });
  }

  /**
   * Increments the statistics counters for a user after a game finishes.
   *
   * Updates both the top-level totals (total_games, total_wins, total_losses,
   * total_surrendered) and the category-specific counters (vs_player or
   * vs_bot.<strategy>) in a single atomic $inc operation.
   *
   * Strategy names are normalised via STRATEGY_MAP before being used as
   * MongoDB field path segments, so display names like 'Monte Carlo' are
   * safely converted to their DB key ('mcts') before the update is applied.
   *
   * @param {string|mongoose.Types.ObjectId} userId - The user's ObjectId.
   * @param {object} params
   * @param {string} params.result   - Game outcome: 'WIN', 'LOSS', or 'SURRENDERED'.
   * @param {string} params.type     - Game type: 'PLAYER' or 'BOT'.
   * @param {string} params.strategy - Bot strategy identifier (ignored when type is 'PLAYER').
   * @returns {Promise<object>} The updated user document.
   */
  async updateStats(userId, { result, type, strategy }) {
    // Normalise the strategy to its canonical DB key.
    const internalStrategy = STRATEGY_MAP[strategy?.toLowerCase()] || (strategy || 'random').toLowerCase();

    // Determine the increment value for each outcome counter.
    const increments = {
      wins:       result === 'WIN'        ? 1 : 0,
      losses:     result === 'LOSS'       ? 1 : 0,
      surrendered: result === 'SURRENDERED' ? 1 : 0
    };

    // Build the atomic $inc update for top-level totals.
    const update = {
      $inc: {
        'statistics.total_games':       1,
        'statistics.total_wins':        increments.wins,
        'statistics.total_losses':      increments.losses,
        'statistics.total_surrendered': increments.surrendered
      }
    };

    // Resolve the category path: vs_player for human games, vs_bot.<strategy> for bot games.
    const categoryPath = type === 'PLAYER'
        ? 'vs_player'
        : `vs_bot.${internalStrategy}`;

    // Apply the same increments to the resolved category path.
    update.$inc[`statistics.${categoryPath}.wins`]        = increments.wins;
    update.$inc[`statistics.${categoryPath}.losses`]      = increments.losses;
    update.$inc[`statistics.${categoryPath}.surrendered`] = increments.surrendered;

    return await User.findByIdAndUpdate(userId, update, { new: true });
  }

  /**
   * Returns the leaderboard data for the frontend and public API.
   *
   * Runs five parallel MongoDB queries (one overall, one per bot strategy)
   * using Promise.all for efficiency. Test users (is_test: true) are excluded
   * from all rankings.
   *
   * Uses .lean() to return plain JavaScript objects instead of Mongoose
   * documents for better performance. Optional chaining (?.) with a ?? 0
   * fallback is used on vs_bot sub-fields because older user documents may
   * not have a statistics.vs_bot entry if they have never played a bot game.
   *
   * @returns {Promise<{
   *   overall: { username: string, total_wins: number, total_games: number }[],
   *   vs_bots: {
   *     random:    { username: string, wins: number }[],
   *     defensive: { username: string, wins: number }[],
   *     mcts:      { username: string, wins: number }[],
   *     ai:        { username: string, wins: number }[]
   *   }
   * }>}
   */
  async getLeaderboard() {
    const filter = { is_test: { $ne: true } };

    const [overall, random, defensive, mcts, ai] = await Promise.all([
      User.find(filter).sort({ 'statistics.total_wins': -1 })          .limit(LEADERBOARD_SIZE).select('username statistics.total_wins statistics.total_games')     .lean(),
      User.find(filter).sort({ 'statistics.vs_bot.random.wins': -1 })   .limit(LEADERBOARD_SIZE).select('username statistics.vs_bot.random')    .lean(),
      User.find(filter).sort({ 'statistics.vs_bot.defensive.wins': -1 }).limit(LEADERBOARD_SIZE).select('username statistics.vs_bot.defensive') .lean(),
      User.find(filter).sort({ 'statistics.vs_bot.mcts.wins': -1 })     .limit(LEADERBOARD_SIZE).select('username statistics.vs_bot.mcts')      .lean(),
      User.find(filter).sort({ 'statistics.vs_bot.ai.wins': -1 })       .limit(LEADERBOARD_SIZE).select('username statistics.vs_bot.ai')        .lean(),
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

  /**
   * Deletes a user account by their MongoDB ObjectId.
   * Used by the DELETE /deleteuser endpoint for test cleanup.
   *
   * @param {string|mongoose.Types.ObjectId} id - The user's ObjectId.
   * @returns {Promise<object|null>} The deleted user document, or null if not found.
   */
  async deleteById(id) {
    return await User.findByIdAndDelete(id);
  }
}

module.exports = MongoUserRepository;