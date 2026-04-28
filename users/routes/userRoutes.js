const express = require('express');
const authMiddleware = require('../middleware/auth');

/** Maps internal strategy identifiers to their human-readable difficulty label. */
const STRATEGY_DIFFICULTY = {
    random:    'Easy 😄',
    defensive: 'Medium 😐',
    mcts:      'Hard 😈',
    ai:        'Medium 🤖'
};

/** Maps internal strategy identifiers to their display names shown in the UI. */
const STRATEGY_NAME = {
    random:    'Random',
    defensive: 'Defensive',
    mcts:      'Monte Carlo',
    ai:        'AI (Gemini)'
};

/**
 * Registers user profile routes on an Express router.
 *
 * Exposed endpoints:
 *   GET /:id         — Get full user profile with statistics and game history (requires auth).
 *   GET /:id/history — Get only the game history for a user (requires auth).
 *
 * @param {object} repository - Data access object (MongoUserRepository or compatible).
 * @returns {express.Router}
 */
module.exports = function userRoutes(repository) {
    const router = express.Router();

    /**
     * GET /:id
     * Returns the full profile for the given user: account info, aggregated
     * statistics (overall and broken down by bot strategy), and game history.
     *
     * The vs_bot subdocument stored in MongoDB is converted to a normalised
     * vs_bots array, with one entry per strategy. Missing strategy entries
     * default to 0 wins / losses / surrenders rather than being omitted,
     * so the frontend always receives a consistent shape regardless of which
     * bots the user has actually played against.
     *
     * The password_hash field is stripped before the response is sent.
     *
     * @param {string} id - MongoDB ObjectId of the user.
     *
     * @returns {200} {
     *   _id, username, created_at,
     *   games: Game[],
     *   statistics: {
     *     total_games, total_wins, total_losses, total_surrendered,
     *     vs_player: { wins, losses, surrendered },
     *     vs_bots: {
     *       id, name, difficulty, wins, losses, surrendered
     *     }[]
     *   }
     * }
     * @returns {404} If no user exists with the given id.
     */
    router.get('/:id', authMiddleware, async function getUserProfile(req, res) {
        try {
            const user = await repository.findById(req.params.id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const obj = user.toObject();
            delete obj.password_hash;

            const stats = obj.statistics || {};
            const vsBot = stats.vs_bot || {};

            // Build the vs_bots array from the STRATEGY_DIFFICULTY map so that
            // all four strategies are always present, even if the user has never
            // played against a particular bot.
            const vs_bots = Object.entries(STRATEGY_DIFFICULTY).map(([name, difficulty]) => ({
                id:          name,
                name:        STRATEGY_NAME[name] || name,
                difficulty,
                wins:        vsBot[name]?.wins        ?? 0,
                losses:      vsBot[name]?.losses      ?? 0,
                surrendered: vsBot[name]?.surrendered ?? 0
            }));

            const games = await repository.findGamesByPlayer(obj._id);

            const response = {
                _id:        obj._id,
                username:   obj.username,
                created_at: obj.created_at,
                games,
                statistics: {
                    total_games:       stats.total_games       ?? 0,
                    total_wins:        stats.total_wins        ?? 0,
                    total_losses:      stats.total_losses      ?? 0,
                    total_surrendered: stats.total_surrendered ?? 0,
                    vs_player:         stats.vs_player         ?? { wins: 0, losses: 0, surrendered: 0 },
                    vs_bots
                }
            };

            res.json(response);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /:id/history
     * Returns the game history for the given user, sorted by creation date descending.
     * Move arrays are excluded from each game document to keep the response lightweight.
     *
     * @param {string} id - MongoDB ObjectId of the user.
     *
     * @returns {200} Game[] (without moves arrays).
     */
    router.get('/:id/history', authMiddleware, async function getUserHistory(req, res) {
        try {
            const games = await repository.findGamesByPlayer(req.params.id);
            res.json(games);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};