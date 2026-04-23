const express = require('express');
const GAMEY_URL = process.env.GAMEY_URL || 'http://gamey:4000'; // NOSONAR - internal Docker network, http is acceptable

// Strategy -> name mapping
const STRATEGY_NAME = {
    random:        'Random',
    defensive:     'Defensive',
    mcts:          'Monte Carlo',
    ai:            'Ai (Gemini)'
};

module.exports = function playRoute() {
    const router = express.Router();

    // Public bot play — no auth, no game id needed
    // position = yen_state (full YEN JSON), bot_id = strategy (public API naming)
    router.get('/play', async function publicBotPlay(req, res) {
        const { position, bot_id, board_size } = req.query;

        if (position === undefined) return res.status(400).json({ error: 'position is required' });

        let parsedPosition;
        try {
            parsedPosition = JSON.parse(position);
        } catch {
            return res.status(400).json({ error: 'position must be valid JSON in YEN format' });
        }

        const resolvedStrategy = STRATEGY_NAME[bot_id?.toLowerCase()] || (bot_id || 'mcts').toLowerCase();

        let gameyResponse;
        try {
            gameyResponse = await fetch(`${GAMEY_URL}/play`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yen_state:  parsedPosition.layout,
                    strategy:   resolvedStrategy.toLowerCase() || 'Monte Carlo',
                    board_size: board_size !== undefined ? Number(board_size) : (parsedPosition.size ?? 5)
                })
            });
        } catch {
            return res.status(503).json({ error: 'Gamey service unreachable' });
        }

        if (!gameyResponse.ok) {
            return res.status(502).json({ error: 'Gamey service returned an error' });
        }

        const data = await gameyResponse.json();

        // Map Gamey's response to the competition API format
        if (data.coordinates) {
            return res.json({ coords: data.coordinates });
        }
        if (data.action) {
            return res.json({ action: data.action });
        }

        res.json(data);
    });

    return router;
};