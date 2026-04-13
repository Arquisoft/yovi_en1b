const express = require('express');
const GAMEY_URL = process.env.GAMEY_URL || 'http://gamey:4000'; // NOSONAR - internal Docker network, http is acceptable

module.exports = function playRoute() {
    const router = express.Router();

    const STRATEGY_DIFFICULTY = {
        random:    'easy',
        defensive: 'medium',
        ncts:      'hard'
    };

    // Public bot play — no auth, no game id needed
    router.post('/play', async function publicBotPlay(req, res) {
        const { position, bot_id, board_size } = req.body || {};

        if (!position) return res.status(400).json({ error: 'position is required' });

        const resolvedStrategy = bot_id || 'ncts';  // default to hardest bot

        let gameyResponse;
        try {
            gameyResponse = await fetch(`${GAMEY_URL}/play`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yen_state:        position,
                    strategy:         resolvedStrategy,
                    difficulty_level: STRATEGY_DIFFICULTY[resolvedStrategy.toLowerCase()] || 'hard',
                    board_size:       board_size ?? 5  // default board size if not provided
                })
            });
        } catch {
            return res.status(503).json({ error: 'Gamey service unreachable' });
        }

        if (!gameyResponse.ok) {
            return res.status(502).json({ error: 'Gamey service returned an error' });
        }

        const data = await gameyResponse.json();
        res.json(data);
    });

    return router;
};