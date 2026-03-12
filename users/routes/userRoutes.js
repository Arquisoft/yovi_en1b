const express = require('express');
const authMiddleware = require('../middleware/auth');

module.exports = (repository) => {
    const router = express.Router();

    // Get user profile + statistics
    router.get('/:id', authMiddleware, async (req, res) => {
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

    // Get user statistics
    router.get('/:id/stats', authMiddleware, async (req, res) => {
        try {
            const user = await repository.findById(req.params.id);
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json(user.statistics);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get user game history
    router.get('/:id/history', authMiddleware, async (req, res) => {
        try {
            const games = await repository.findGamesByPlayer(req.params.id);
            res.json(games);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};