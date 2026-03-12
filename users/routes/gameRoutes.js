const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');

const GAMEY_URL = process.env.GAMEY_URL || 'http://gamey:4000'; // NOSONAR - internal Docker network, http is acceptable

module.exports = function gameRoutes(repository) {
    const router = express.Router();

    // Bot play endpoint — public, no JWT needed — MUST be before /:id routes
    router.post('/play', async function botPlay(req, res) {
        const { position, bot_id, strategy } = req.body || {};

        if (!position) return res.status(400).json({ error: 'position is required (YEN notation)' });

        let gameyResponse;
        try {
            gameyResponse = await fetch(`${GAMEY_URL}/play`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ position, bot_id, strategy })
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

    // Create a new game
    router.post('/', authMiddleware, async function createGame(req, res) {
        const { board_size, strategy, difficulty_level, game_type, name_of_enemy } = req.body || {};

        if (!board_size) return res.status(400).json({ error: 'board_size is required' });

        if (game_type === 'PLAYER' && !name_of_enemy) {
            return res.status(400).json({ error: 'name_of_enemy is required for PLAYER games' });
        }

        try {
            const current_turn = crypto.randomInt(2) === 0 ? 'B' : 'R';

            const game = await repository.createGame({
                player_id:        req.user.userId,
                game_type:        game_type || 'BOT',
                name_of_enemy:    name_of_enemy || null,
                board_size,
                strategy:         strategy || 'random',
                difficulty_level: difficulty_level || 'medium',
                current_turn
            });
            res.status(201).json(game);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get game state
    router.get('/:id', authMiddleware, async function getGame(req, res) {
        try {
            const game = await repository.findGameById(req.params.id);
            if (!game) return res.status(404).json({ error: 'Game not found' });
            res.json(game);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Submit a move — player inferred from current_turn
    router.post('/:id/move', authMiddleware, async function submitMove(req, res) {
        const { coordinates } = req.body || {};

        if (!coordinates || coordinates.x === undefined || coordinates.y === undefined || coordinates.z === undefined) {
            return res.status(400).json({ error: 'coordinates (x, y, z) are required' });
        }

        try {
            const game = await repository.findGameById(req.params.id);
            if (!game) return res.status(404).json({ error: 'Game not found' });
            if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

            const player = game.current_turn;
            const yen_state = req.body?.yen_state ?? null;

            game.moves.push({ move_number: game.moves.length + 1, player, coordinates, yen_state });
            game.current_turn = game.current_turn === 'B' ? 'R' : 'B';
            await game.save();

            res.status(201).json(game);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Finish a game
    router.put('/:id/finish', authMiddleware, async function finishGame(req, res) {
        const { result, yen_final_state, duration_seconds } = req.body || {};

        if (!result) return res.status(400).json({ error: 'result is required (WIN, LOSS or DRAW)' });

        try {
            const game = await repository.findGameById(req.params.id);
            if (!game) return res.status(404).json({ error: 'Game not found' });
            if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

            const updatedGame = await repository.updateGame(req.params.id, {
                status: 'FINISHED',
                result,
                yen_final_state,
                duration_seconds: duration_seconds || 0
            });

            // Skip stats update if DRAW (user quit)
            if (result !== 'DRAW') {
                await repository.updateStats(game.player_id, {
                    result,
                    type: game.game_type,
                    difficulty: game.difficulty_level
                });
            }

            res.json(updatedGame);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get all moves ordered by move_number (for replay)
    router.get('/:id/moves', authMiddleware, async function getMoves(req, res) {
        try {
            const game = await repository.findGameById(req.params.id);
            if (!game) return res.status(404).json({ error: 'Game not found' });
            const sortedMoves = game.moves.sort((a, b) => a.move_number - b.move_number);
            res.json(sortedMoves);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};