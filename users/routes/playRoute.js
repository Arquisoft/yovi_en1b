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
    // position = yen_state, bot_id = strategy (public API naming)
    router.get('/play', async function publicBotPlay(req, res) {
        const { position, bot_id, board_size } = req.query;

        if (position === undefined) return res.status(400).json({ error: 'position is required' });

        const resolvedStrategy = bot_id || 'ncts';

        let parsedPosition;
        try {
            parsedPosition = JSON.parse(position);
        } catch {
            return res.status(400).json({ error: 'position must be valid JSON in YEN format' });
        }

        let gameyResponse;
        try {
            gameyResponse = await fetch(`${GAMEY_URL}/play`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yen_state:        parsedPosition,
                    strategy:         resolvedStrategy,
                    difficulty_level: STRATEGY_DIFFICULTY[resolvedStrategy.toLowerCase()] || 'hard',
                    board_size:       parsedPosition.size ?? board_size ?? 5
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