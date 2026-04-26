const express = require('express');
const authMiddleware = require('../middleware/auth');

// Strategy -> difficulty mapping
const STRATEGY_DIFFICULTY = {
    random:        'Easy 😄',
    defensive:     'Medium 😐',
    mcts:          'Hard 😈',
    ai:            'Medium 🤖'
};

// Strategy -> name mapping
const STRATEGY_NAME = {
    random:        'Random',
    defensive:     'Defensive',
    mcts:          'Monte Carlo',
    ai:            'AI (Gemini)'
};

module.exports = function userRoutes(repository) {
    const router = express.Router();

    // Get user profile — statistics nested, vs_bot converted to vs_bots array, games included
    router.get('/:id', authMiddleware, async function getUserProfile(req, res) {
        try {
            const user = await repository.findById(req.params.id);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const obj = user.toObject();
            delete obj.password_hash;

            const stats = obj.statistics || {};
            const vsBot = stats.vs_bot || {};

            const vs_bots = Object.entries(STRATEGY_DIFFICULTY).map(([name, difficulty]) => ({
                id:         name,
                name:       STRATEGY_NAME[name] || name, // Shows "Monte Carlo" instead of "mcts"
                difficulty: difficulty,
                wins:       vsBot[name]?.wins   ?? 0,
                losses:     vsBot[name]?.losses ?? 0,
                surrendered: vsBot[name]?.surrendered ?? 0
            }));

            const games = await repository.findGamesByPlayer(obj._id);

            const response = {
                _id:        obj._id,
                username:   obj.username,
                created_at: obj.created_at,
                games,
                statistics: {
                    total_games:  stats.total_games  ?? 0,
                    total_wins:   stats.total_wins   ?? 0,
                    total_losses: stats.total_losses ?? 0,
                    total_surrendered: stats.total_surrendered ?? 0,
                    vs_player:    stats.vs_player    ?? { wins: 0, losses: 0, surrendered: 0 },
                    vs_bots
                }
            };

            res.json(response);
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