const express = require('express');
const GAMEY_URL = process.env.GAMEY_URL || 'http://gamey:4000'; // NOSONAR - internal Docker network, http is acceptable

/**
 * Maps public-facing bot_id values (as used in the external competition API)
 * to their display names. The bot_id sent by external clients matches the
 * internal Gamey strategy identifier, so no translation is needed for routing —
 * this map is used only for documentation and response labelling.
 */
const STRATEGY_NAME = {
    random:    'Random',
    defensive: 'Defensive',
    mcts:      'Monte Carlo',
    ai:        'AI (Gemini)'
};

/**
 * Registers the public bot play route on an Express router.
 *
 * Exposed endpoints:
 *   GET /play — Request a bot move given a board position (public, no auth required).
 *
 * @returns {express.Router}
 */
module.exports = function playRoute() {
    const router = express.Router();

    /**
     * GET /play
     * Public endpoint for the external competition API.
     * Accepts a board position in YEN format and a bot strategy, forwards the
     * request to Gamey's /play endpoint, and returns the bot's chosen move.
     *
     * No authentication or game ID is required — this endpoint is stateless
     * and designed for third-party clients participating in the open competition.
     *
     * @query {string} position   - Full board state as a JSON-encoded YEN object:
     *                              { size, turn, players, layout }.
     *                              The layout string uses '/' as row separators and
     *                              '.' for empty cells (e.g. "./../..." for size 3).
     * @query {string} [bot_id]   - Strategy identifier: 'random', 'defensive', 'ai', or 'mcts'.
     *                              Defaults to 'mcts' if not provided.
     * @query {number} [board_size] - Overrides the board size from the position object.
     *
     * @returns {200} { coords: [row, col] } — The bot's chosen move coordinates.
     * @returns {400} If position is missing or not valid JSON in YEN format.
     * @returns {503} If the Gamey service is unreachable.
     * @returns {502} If Gamey returns a non-OK response.
     */
    router.get('/play', async function publicBotPlay(req, res) {
        const { position, bot_id, board_size } = req.query;

        if (position === undefined) return res.status(400).json({ error: 'position is required' });

        let parsedPosition;
        try {
            parsedPosition = JSON.parse(position);
        } catch {
            return res.status(400).json({ error: 'position must be valid JSON in YEN format' });
        }

        // Use the bot_id directly as the Gamey strategy identifier.
        // If bot_id is not provided or not recognised, default to 'mcts'.
        const resolvedStrategy = STRATEGY_NAME[bot_id?.toLowerCase()]
            ? bot_id.toLowerCase()
            : (bot_id || 'mcts').toLowerCase();

        let gameyResponse;
        try {
            gameyResponse = await fetch(`${GAMEY_URL}/play`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    yen_state:  parsedPosition.layout,
                    strategy:   resolvedStrategy,
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

        // Map Gamey's response to the competition API format.
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