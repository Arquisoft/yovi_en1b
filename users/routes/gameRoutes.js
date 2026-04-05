const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');

const GAMEY_URL = process.env.GAMEY_URL || 'http://gamey:4000'; // NOSONAR - internal Docker network, http is acceptable

// Strategy -> difficulty mapping
const STRATEGY_DIFFICULTY = {
    random: 'easy',
    dijkstra: 'medium',
    ai: 'hard'
};

// Helper: auto-finish a game if Gamey reports a winner
async function autoFinishIfWinner(game, winner, repository) {
    if (!winner) return;
    const winningPlayer = game.moves.at(-1)?.player;
    const result = winningPlayer === 'B' ? 'WIN' : 'LOSS';
    await repository.updateGame(game._id, {
        status: 'FINISHED',
        result,
        yen_final_state: game.moves.at(-1)?.yen_state ?? null,
        duration_seconds: 0
    });
    await repository.updateStats(game.player_id, {
        result,
        type: game.game_type,
        strategy: game.strategy
    });
}

// Helper: call Gamey to compute new yen_state after a move
async function computeYenState(yen_state_prev, coordinates) {
    const gameyResponse = await fetch(`${GAMEY_URL}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yen_state_prev, coordinates })
    });

    if (!gameyResponse.ok) {
        const err = new Error('Gamey compute error');
        err.status = 502;
        throw err;
    }

    return await gameyResponse.json(); // { yen_state, winner }
}

module.exports = function gameRoutes(repository) {
    const router = express.Router();

    // Get available game options — public, no auth needed
    router.get('/options', async function getGameOptions(req, res) {
        res.json({
            strategies: [
                { name: 'Random', difficulty: 'Easy 😄' },
                { name: 'AI', difficulty: 'Medium 😐' },
                { name: 'Dijkstra', difficulty: 'Hard 😈' }
            ],
            variants: [
                'Classic Y',
                'Master Y (coming soon)',
                'Pie Rule (coming soon)'
            ]
        });
    });

    // Create a new game
    router.post('/', authMiddleware, async function createGame(req, res) {
        const { board_size, strategy, game_type, name_of_enemy } = req.body || {};

        if (!board_size) return res.status(400).json({ error: 'board_size is required' });

        if (game_type === 'PLAYER' && !name_of_enemy) {
            return res.status(400).json({ error: 'name_of_enemy is required for PLAYER games' });
        }

        try {
            const current_turn = crypto.randomInt(2) === 0 ? 'B' : 'R';
            const resolvedStrategy = strategy || 'random';

            const game = await repository.createGame({
                player_id: req.user.userId,
                game_type: game_type || 'BOT',
                name_of_enemy: name_of_enemy || null,
                board_size,
                strategy: resolvedStrategy,
                difficulty_level: STRATEGY_DIFFICULTY[resolvedStrategy.toLowerCase()] || 'easy',
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

    // Submit a player move
    router.post('/:id/move', authMiddleware, async function submitMove(req, res) {
        const { coordinates } = req.body || {};

        if (!coordinates || coordinates.x === undefined || coordinates.y === undefined || coordinates.z === undefined) {
            return res.status(400).json({ error: 'coordinates (x, y, z) are required' });
        }

        let game;
        try {
            game = await repository.findGameById(req.params.id);
        } catch {
            return res.status(500).json({ error: 'Error retrieving game' });
        }

        if (!game) return res.status(404).json({ error: 'Game not found' });
        if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

        const yen_state_prev = game.moves.at(-1)?.yen_state ?? null;

        let gameyResult;
        try {
            gameyResult = await computeYenState(yen_state_prev, coordinates);
        } catch (err) {
            return res.status(err.status || 503).json({ error: err.message });
        }

        const { yen_state: new_yen_state, winner } = gameyResult;

        try {
            const player = game.current_turn;
            game.moves.push({ move_number: game.moves.length + 1, player, coordinates, yen_state: new_yen_state });
            game.current_turn = game.current_turn === 'B' ? 'R' : 'B';
            await game.save();
            await autoFinishIfWinner(game, winner, repository);
            const updatedGame = await repository.findGameById(game._id);
            res.status(201).json(updatedGame);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Request bot move for an existing game
    router.get('/:id/play', authMiddleware, async function botPlay(req, res) {
        let game;
        try {
            game = await repository.findGameById(req.params.id);
        } catch {
            return res.status(500).json({ error: 'Error retrieving game' });
        }

        if (!game) return res.status(404).json({ error: 'Game not found' });
        if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

        const yen_state = game.moves.at(-1)?.yen_state ?? null;

        let gameyResponse;
        try {
            gameyResponse = await fetch(`${GAMEY_URL}/play`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yen_state,
                    strategy: game.strategy,
                    difficulty_level: game.difficulty_level,
                    board_size: game.board_size
                })
            });
        } catch {
            return res.status(503).json({ error: 'Gamey service unreachable' });
        }

        if (!gameyResponse.ok) {
            return res.status(502).json({ error: 'Gamey service returned an error' });
        }

        const { coordinates, yen_state: botYenState, winner } = await gameyResponse.json();

        try {
            game.moves.push({
                move_number: game.moves.length + 1,
                player: game.current_turn,
                coordinates,
                yen_state: botYenState
            });
            game.current_turn = game.current_turn === 'B' ? 'R' : 'B';
            await game.save();
            await autoFinishIfWinner(game, winner, repository);
            const updatedGame = await repository.findGameById(game._id);
            res.status(201).json(updatedGame);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    // Finish a game manually (DRAW when user quits)
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

            if (result !== 'DRAW') {
                await repository.updateStats(game.player_id, {
                    result,
                    type: game.game_type,
                    strategy: game.strategy
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

    // Undo last move — only allowed in PLAYER vs PLAYER games
    router.post('/:id/undo', authMiddleware, async function undoMove(req, res) {
        try {
            const game = await repository.findGameById(req.params.id);
            if (!game) return res.status(404).json({ error: 'Game not found' });
            if (game.status === 'FINISHED') return res.status(400).json({ error: 'Cannot undo a finished game' });
            if (game.game_type !== 'PLAYER') return res.status(400).json({ error: 'Undo is only allowed in player vs player games' });
            if (game.moves.length === 0) return res.status(400).json({ error: 'No moves to undo' });

            game.moves.pop();
            game.current_turn = game.current_turn === 'B' ? 'R' : 'B';
            await game.save();

            const updatedGame = await repository.findGameById(game._id);
            res.json(updatedGame);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};