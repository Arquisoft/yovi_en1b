const express = require('express');

module.exports = function leaderBoardRoute(repository) {
    const router = express.Router();

    // Get leaderboard — public, no auth needed
    router.get('/', async function getLeaderboard(req, res) {
        try {
            const leaderboard = await repository.getLeaderboard();
            res.json(leaderboard);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};