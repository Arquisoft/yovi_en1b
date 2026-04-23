const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');

const GAMEY_URL = process.env.GAMEY_URL || 'http://gamey:4000'; // NOSONAR - internal Docker network, http is acceptable

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

// Valid variants and their constraints
const VALID_VARIANTS = {
    explosions: {
        name:               'Explosions',
        description:        'A bomb appears randomly on the board at game start. Playing on the bomb captures that cell and clears all neighbouring cells.',
        allowed_strategies: ['random', 'ai'],
        min_board_size:     7
    }
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
        duration_seconds: Math.floor((Date.now() - new Date(game.created_at).getTime()) / 1000)
    });
    await repository.updateStats(game.player_id, {
        result,
        type:     game.game_type,
        strategy: game.strategy
    });
}

// Helper: ask Gamey for a fresh initial game state. Used at game creation
// time to pre-place bombs for the Explosions variant so the player can see
// the mine on the board *before* they make their first move.
//
// Returns the layout string (yen.layout) or null on failure — a null return
// means "skip the pre-placement, the game will still work without it".
async function fetchInitialYenState(board_size, variants) {
    try {
        const response = await fetch(`${GAMEY_URL}/v1/game/new`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ board_size, variants })
        });
        if (!response.ok) return null;
        const body = await response.json();
        return body?.yen?.layout ?? null;
    } catch {
        return null;
    }
}

// Helper: call Gamey to compute new yen_state after a move.
//
// Passes `variants` through so Gamey can place bombs on the very first move of
// an Explosions game (when yen_state_prev is null) and so subsequent parses
// keep the Explosions variant active. Without this, bombs would never be
// placed and the frontend never saw a mine (issue #203, frontend visibility).
async function computeYenState(yen_state_prev, coordinates, variants = []) {
    const gameyResponse = await fetch(`${GAMEY_URL}/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yen_state_prev, coordinates, variants })
    });

    if (!gameyResponse.ok) {
        const err = new Error('Gamey compute error');
        err.status = 502;
        throw err;
    }

    const body = await gameyResponse.json();
    return body; // Result contains yen_state, winner, variants, and explosives
}

module.exports = function gameRoutes(repository) {
    const router = express.Router();

    // Get available game options — public, no auth needed
    router.get('/options', async function getGameOptions(req, res) {
        res.json({
            strategies: [
                { id: 'random',    name: STRATEGY_NAME.random,    difficulty: 'Easy 😄'    },
                { id: 'defensive', name: STRATEGY_NAME.defensive, difficulty: 'Medium 😐'  },
                { id: 'mcts',      name: STRATEGY_NAME.mcts,      difficulty: 'Hard 😈'    },
                { id: 'ai',        name: STRATEGY_NAME.ai,        difficulty: 'Medium 🤖'  }
            ],
            variants: [
                { name: 'Explosions', description: VALID_VARIANTS.explosions.description, allowed_strategies: VALID_VARIANTS.explosions.allowed_strategies }
            ]
        });
    });

    // Create a new game
    router.post('/', authMiddleware, async function createGame(req, res) {
        const { board_size, strategy, game_type, name_of_enemy, variants } = req.body || {};

        if (!board_size) return res.status(400).json({ error: 'board_size is required' });

        if (game_type === 'PLAYER' && !name_of_enemy) {
            return res.status(400).json({ error: 'name_of_enemy is required for PLAYER games' });
        }

        // 1. Definimos el mapa (llaves siempre en minúsculas)
        const STRATEGY_MAP = {
            'monte carlo': 'mcts',
            'ai (gemini)': 'ai',
            'random':      'random',
            'defensive':   'defensive'
        };

        // 2. Normalización CRÍTICA
        // Primero: pasamos a minúsculas la entrada del FE (ej: "AI (Gemini)" -> "ai (gemini)")
        const inputLower = strategy?.toLowerCase();

        // Segundo: Buscamos en el mapa. Si no está, usamos la cadena original en minúsculas.
        const resolvedStrategy = STRATEGY_MAP[inputLower] || inputLower || 'random';

        const resolvedVariants = variants ?? [];
        for (const v of resolvedVariants) {
            const config = VALID_VARIANTS[v.toLowerCase()];
            if (!config) return res.status(400).json({ error: `Unknown variant: ${v}` });

            // 3. Validación contra la variante
            // Aquí resolvedStrategy será "ai", que SI está en ['random', 'ai']
            if (config.allowed_strategies && !config.allowed_strategies.includes(resolvedStrategy)) {
                return res.status(400).json({
                    error: `Strategy '${strategy}' is not allowed with variant '${v}'`
                });
            }

            if (config.min_board_size && board_size < config.min_board_size) {
                return res.status(400).json({ error: `Variant '${v}' requires board_size >= ${config.min_board_size}` });
            }
        }

        try {
            const current_turn = crypto.randomInt(2) === 0 ? 'B' : 'R';

            // For variants that pre-place pieces (currently just Explosions
            // with its random bomb), fetch the initial board state from Gamey
            // so the frontend can render the bomb before the first move. If
            // the call fails we fall back silently to an empty board — the
            // bomb will still be placed on the first /compute round-trip.
            let initial_yen_state = null;
            if (resolvedVariants.length > 0) {
                initial_yen_state = await fetchInitialYenState(board_size, resolvedVariants);
            }

            const game = await repository.createGame({
                player_id:        req.user.userId,
                game_type:        game_type || 'BOT',
                name_of_enemy:    name_of_enemy || null,
                board_size,
                strategy:         resolvedStrategy,
                difficulty_level: STRATEGY_DIFFICULTY[resolvedStrategy.toLowerCase()] || 'easy',
                variants:         resolvedVariants,
                initial_yen_state,
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

        // Use last move's yen_state if any moves have been made; otherwise fall
        // back to the pre-placed initial state (needed for Explosions so the
        // bomb positions chosen at game creation survive into the first move).
        const yen_state_prev =
            game.moves.at(-1)?.yen_state ??
            game.initial_yen_state ??
            null;

        let gameyResult;
        try {
            gameyResult = await computeYenState(yen_state_prev, coordinates, game.variants ?? []);
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

        // Same fallback chain as for human moves: last move → initial state
        // (from game creation, carries pre-placed bombs) → null (empty board).
        const yen_state =
            game.moves.at(-1)?.yen_state ??
            game.initial_yen_state ??
            null;

        let gameyResponse;
        try {
            gameyResponse = await fetch(`${GAMEY_URL}/play`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    yen_state,
                    strategy:         game.strategy,
                    difficulty_level: game.difficulty_level,
                    board_size:       game.board_size,
                    variants:         game.variants
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
                player:      game.current_turn,
                coordinates,
                yen_state:   botYenState
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

    // Finish a game manually (UNFINISHED when user quits — does not affect statistics)
    router.put('/:id/finish', authMiddleware, async function finishGame(req, res) {
        const { result, yen_final_state } = req.body || {};

        if (!result) return res.status(400).json({ error: 'result is required (WIN, LOSS or UNFINISHED)' });

        try {
            const game = await repository.findGameById(req.params.id);
            if (!game) return res.status(404).json({ error: 'Game not found' });
            if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

            const duration_seconds = Math.floor((Date.now() - new Date(game.created_at).getTime()) / 1000);
            const updatedGame = await repository.updateGame(req.params.id, {
                status: 'FINISHED',
                result,
                yen_final_state,
                duration_seconds
            });

            if (result !== 'UNFINISHED') {
                await repository.updateStats(game.player_id, {
                    result,
                    type:     game.game_type,
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