const express = require('express');
const authMiddleware = require('../middleware/auth');

module.exports = function userRoutes(repository) {
    const router = express.Router();

    // Get user profile
    router.get('/:id', authMiddleware, async function getUserProfile(req, res) {
        try {
            const user = await repository.findById(req.params.id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const response = user.toObject();
            delete response.password_hash;
            res.json(response);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    const BOT_DIFFICULTY = {
        random:   'Easy 😄',
        ai:       'Medium 😐',
        dijkstra: 'Hard 😈'
    };

    //Get user statistics
    router.get('/:id/stats', authMiddleware, async function getUserStats(req, res) {
        try {
            const user = await repository.findById(req.params.id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const { statistics } = user;
            const vs_bot = statistics.vs_bot.toObject();

            res.json({
                total_games:  statistics.total_games,
                total_wins:   statistics.total_wins,
                total_losses: statistics.total_losses,
                total_draws:  statistics.total_draws,
                vs_player:    statistics.vs_player,
                vs_bots: Object.entries(vs_bot).map(([name, stats]) => ({
                    name,
                    difficulty: BOT_DIFFICULTY[name] ?? 'Unknown',
                    wins:       stats.wins,
                    losses:     stats.losses,
                    draws:      stats.draws
                }))
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get user game history
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