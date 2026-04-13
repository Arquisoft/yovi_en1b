const express = require('express');
const GAMEY_URL = process.env.GAMEY_URL || 'http://gamey:4000'; // NOSONAR - internal Docker network, http is acceptable


module.exports = function playRoute() {
    const router = express.Router();

    // Strategy -> difficulty mapping
    const STRATEGY_DIFFICULTY = {
        random: 'easy',
        dijkstra: 'medium',
        ai: 'hard'
    };

    // Public bot play — no auth, no game id needed
    // Receives yen_state + strategy directly, forwards to Gamey
    router.post('/play', async function publicBotPlay(req, res) {
        const {yen_state, strategy, board_size} = req.body || {};

        if (!board_size) return res.status(400).json({error: 'board_size is required'});

        let gameyResponse;
        try {
            gameyResponse = await fetch(`${GAMEY_URL}/play`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    yen_state: yen_state ?? null,
                    strategy: strategy || 'random',
                    difficulty_level: STRATEGY_DIFFICULTY[strategy?.toLowerCase()] || 'easy',
                    board_size
                })
            });
        } catch {
            return res.status(503).json({error: 'Gamey service unreachable'});
        }

        if (!gameyResponse.ok) {
            return res.status(502).json({error: 'Gamey service returned an error'});
        }

        const data = await gameyResponse.json();
        res.json(data);
    });

    return router;
}