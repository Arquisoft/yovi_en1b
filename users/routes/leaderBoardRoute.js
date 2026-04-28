const express = require('express');

/**
 * Registers the leaderboard route on an Express router.
 *
 * Exposed endpoints:
 *   GET /leaderboard — Returns the top players overall and per bot strategy (public).
 *
 * @param {object} repository - Data access object (MongoUserRepository or compatible).
 * @returns {express.Router}
 */
module.exports = function leaderBoardRoute(repository) {
    const router = express.Router();

    /**
     * GET /leaderboard
     * Returns the top 10 players globally and the top 10 players for each bot strategy.
     * Public — no authentication required.
     *
     * @returns {200} {
     *   overall:  { username, total_wins, total_games }[],
     *   vs_bots: {
     *     random:    { username, wins }[],
     *     defensive: { username, wins }[],
     *     ai:        { username, wins }[],
     *     mcts:      { username, wins }[]
     *   }
     * }
     */
    router.get('/leaderboard', async function getLeaderboard(req, res) {
        try {
            const leaderboard = await repository.getLeaderboard();
            res.json(leaderboard);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};