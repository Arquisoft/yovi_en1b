const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');

const GAMEY_URL = process.env.GAMEY_URL || 'http://gamey:4000'; // NOSONAR - internal Docker network, http is acceptable

/** Maps internal strategy identifiers to their human-readable difficulty label. */
const STRATEGY_DIFFICULTY = {
    random:    'Easy 😄',
    defensive: 'Medium 😐',
    mcts:      'Hard 😈',
    ai:        'Medium 🤖'
};

/** Maps internal strategy identifiers to their display names shown in the UI. */
const STRATEGY_NAME = {
    random:    'Random',
    defensive: 'Defensive',
    mcts:      'Monte Carlo',
    ai:        'AI (Gemini)'
};

/**
 * Registry of valid game variants and their constraints.
 * Each entry defines the variant name, description, which bot strategies
 * are compatible with it, and the minimum board size required.
 */
const VALID_VARIANTS = {
    explosions: {
        name:               'Explosions',
        description:        'A bomb appears randomly on the board at game start. Playing on the bomb captures that cell and clears all neighbouring cells.',
        allowed_strategies: ['random', 'ai'],
        min_board_size:     7
    }
};

/**
 * Automatically finishes a game when Gamey reports a winner after a move.
 * Determines the result from the perspective of the game's owner (player_id),
 * persists the FINISHED status to the database, and updates the player's stats.
 *
 * @param {object} game       - Mongoose game document (must include moves and player_id).
 * @param {string|null} winner - Winner token returned by Gamey ('B', 'R', or null).
 *                               If null, this function is a no-op.
 * @param {object} repository  - Data access object exposing updateGame and updateStats.
 * @returns {Promise<void>}
 */
async function autoFinishIfWinner(game, winner, repository) {
    if (!winner) return;
    const winningPlayer = game.moves.at(-1)?.player;
    const result = winningPlayer === 'B' ? 'WIN' : 'LOSS';
    await repository.updateGame(game._id, {
        status:          'FINISHED',
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

/**
 * Fetches the initial YEN board state from Gamey at game creation time.
 * Used by variants (e.g. Explosions) that need to pre-place pieces on the board
 * before the first move so the frontend can render them immediately.
 *
 * Returns null on any failure — the game will still work without it, since
 * Gamey will place the pieces on the first /compute round-trip.
 *
 * @param {number} board_size - Size of the triangular board.
 * @param {string[]} variants - List of active variant names (e.g. ['explosions']).
 * @returns {Promise<string|null>} The YEN layout string, or null if unavailable.
 */
async function fetchInitialYenState(board_size, variants) {
    try {
        const response = await fetch(`${GAMEY_URL}/v1/game/new`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ board_size, variants })
        });
        if (!response.ok) return null;
        const body = await response.json();
        return body?.yen?.layout ?? null;
    } catch {
        return null;
    }
}

/**
 * Calls Gamey's /compute endpoint to apply a player move and obtain the new board state.
 * Passes variants through so Gamey can handle variant-specific logic
 * (e.g. bomb placement on the first move of an Explosions game).
 *
 * @param {string|null} yen_state_prev - The YEN state before the move, or null for an empty board.
 * @param {object} coordinates         - Move coordinates { x, y, z }.
 * @param {string[]} [variants=[]]     - Active variant names to forward to Gamey.
 * @param {number} [turn=0]            - Turn index (0 = Blue, 1 = Red); decisive when yen_state_prev is null.
 * @returns {Promise<object>} Gamey response containing yen_state, winner, variants, and explosives.
 * @throws {Error} With status 502 if Gamey returns a non-OK response.
 */
async function computeYenState(yen_state_prev, coordinates, variants = [], turn = 0) {
    const gameyResponse = await fetch(`${GAMEY_URL}/compute`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        // `turn` is only decisive when yen_state_prev is null (first human
        // move on a fresh board) — for all subsequent moves the t{n}| prefix
        // embedded in yen_state_prev already carries the authoritative turn.
        body: JSON.stringify({ yen_state_prev, coordinates, variants, turn })
    });

    if (!gameyResponse.ok) {
        const err = new Error('Gamey compute error');
        err.status = 502;
        throw err;
    }

    const body = await gameyResponse.json();
    return body;
}

/**
 * Registers all game-related routes on an Express router.
 *
 * Exposed endpoints:
 *   GET  /options         — List available strategies and variants (public).
 *   POST /                — Create a new game (requires auth).
 *   GET  /:id             — Get the current game state (requires auth).
 *   POST /:id/move        — Submit a human player move (requires auth).
 *   GET  /:id/play        — Request a bot move for an existing game (requires auth).
 *   PUT  /:id/finish      — Manually finish a game with an explicit result (requires auth).
 *   GET  /:id/moves       — Get all moves ordered by move_number for replay (requires auth).
 *   POST /:id/undo        — Undo the last move; only allowed in PLAYER games (requires auth).
 *
 * @param {object} repository - Data access object (MongoUserRepository or compatible).
 * @returns {express.Router}
 */
module.exports = function gameRoutes(repository) {
    const router = express.Router();

    /**
     * GET /options
     * Returns the list of available bot strategies and game variants.
     * Public — no authentication required.
     */
    router.get('/options', async function getGameOptions(req, res) {
        res.json({
            strategies: [
                { id: 'random',    name: STRATEGY_NAME.random,    difficulty: 'Easy 😄'   },
                { id: 'defensive', name: STRATEGY_NAME.defensive, difficulty: 'Medium 😐' },
                { id: 'mcts',      name: STRATEGY_NAME.mcts,      difficulty: 'Hard 😈'   },
                { id: 'ai',        name: STRATEGY_NAME.ai,        difficulty: 'Medium 🤖' }
            ],
            variants: [
                {
                    name:               'Explosions',
                    description:        VALID_VARIANTS.explosions.description,
                    allowed_strategies: VALID_VARIANTS.explosions.allowed_strategies
                }
            ]
        });
    });

    /**
     * POST /
     * Creates a new game for the authenticated user.
     *
     * @body {number}   board_size    - Size of the triangular board (required).
     * @body {string}   [strategy]    - Bot strategy id or display name. Defaults to 'random'.
     * @body {string}   [game_type]   - 'BOT' (default) or 'PLAYER'.
     * @body {string}   [name_of_enemy] - Required when game_type is 'PLAYER'.
     * @body {string[]} [variants]    - Optional list of active variant names (e.g. ['Explosions']).
     *
     * The starting turn (B or R) is assigned randomly with crypto.randomInt.
     * Strategy names are normalised to lowercase internal identifiers via STRATEGY_MAP,
     * so the frontend can send display names like "AI (Gemini)" or "Monte Carlo".
     */
    router.post('/', authMiddleware, async function createGame(req, res) {
        const { board_size, strategy, game_type, name_of_enemy, variants } = req.body || {};

        if (!board_size) return res.status(400).json({ error: 'board_size is required' });

        if (game_type === 'PLAYER' && !name_of_enemy) {
            return res.status(400).json({ error: 'name_of_enemy is required for PLAYER games' });
        }

        // Maps frontend display names (lowercased) to internal strategy identifiers.
        // Keys are always lowercase so the comparison is case-insensitive.
        const STRATEGY_MAP = {
            'monte carlo': 'mcts',
            'ai (gemini)': 'ai',
            'random':      'random',
            'defensive':   'defensive'
        };

        // Normalise the incoming strategy value:
        // 1. Lowercase the input (e.g. "AI (Gemini)" -> "ai (gemini)").
        // 2. Look it up in the map; fall back to the lowercased value itself,
        //    then to 'random' if nothing was provided.
        const inputLower = strategy?.toLowerCase();
        const resolvedStrategy = STRATEGY_MAP[inputLower] || inputLower || 'random';

        // Validate each requested variant against the registry.
        const resolvedVariants = variants ?? [];
        for (const v of resolvedVariants) {
            const config = VALID_VARIANTS[v.toLowerCase()];
            if (!config) return res.status(400).json({ error: `Unknown variant: ${v}` });

            // Reject incompatible strategy / variant combinations.
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
            // Randomly decide which colour moves first.
            const current_turn = crypto.randomInt(2) === 0 ? 'B' : 'R';

            // For variants that pre-place pieces (currently just Explosions with
            // its random bomb), fetch the initial board state from Gamey so the
            // frontend can render the bomb before the first move. If the call
            // fails, fall back silently to an empty board — the bomb will still
            // be placed on the first /compute round-trip.
            let initial_yen_state = null;
            if (resolvedVariants.length > 0) {
                initial_yen_state = await fetchInitialYenState(board_size, resolvedVariants);
            }

            const game = await repository.createGame({
                player_id:       req.user.userId,
                game_type:       game_type || 'BOT',
                name_of_enemy:   name_of_enemy || null,
                board_size,
                strategy:        resolvedStrategy,
                difficulty_level: STRATEGY_DIFFICULTY[resolvedStrategy.toLowerCase()] || 'easy',
                variants:        resolvedVariants,
                initial_yen_state,
                current_turn
            });
            res.status(201).json(game);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /:id
     * Returns the full game document for the given game ID.
     *
     * @param {string} id - MongoDB ObjectId of the game.
     */
    router.get('/:id', authMiddleware, async function getGame(req, res) {
        try {
            const game = await repository.findGameById(req.params.id);
            if (!game) return res.status(404).json({ error: 'Game not found' });
            res.json(game);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * POST /:id/move
     * Submits a human player move for the given game.
     * Forwards the move to Gamey via /compute to obtain the new YEN state,
     * persists the move, and auto-finishes the game if Gamey reports a winner.
     *
     * @param {string} id - MongoDB ObjectId of the game.
     * @body {object} coordinates - Move coordinates { x, y, z } (all required).
     */
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

        // Use the last move's yen_state if any moves have been made; otherwise fall
        // back to the pre-placed initial state (needed for Explosions so the bomb
        // positions chosen at game creation survive into the first move).
        const yen_state_prev =
            game.moves.at(-1)?.yen_state ??
            game.initial_yen_state ??
            null;

        let gameyResult;
        try {
            gameyResult = await computeYenState(
                yen_state_prev,
                coordinates,
                game.variants ?? [],
                game.current_turn === 'R' ? 1 : 0
            );
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

    /**
     * GET /:id/play
     * Requests a bot move for an existing game.
     * Calls Gamey's /play endpoint with the current board state and strategy,
     * persists the resulting move, and auto-finishes the game if a winner is detected.
     *
     * @param {string} id - MongoDB ObjectId of the game.
     */
    router.get('/:id/play', authMiddleware, async function botPlay(req, res) {
        let game;
        try {
            game = await repository.findGameById(req.params.id);
        } catch {
            return res.status(500).json({ error: 'Error retrieving game' });
        }

        if (!game) return res.status(404).json({ error: 'Game not found' });
        if (game.status === 'FINISHED') return res.status(400).json({ error: 'Game is already finished' });

        // Fallback chain: last move state → initial state (carries pre-placed bombs) → null (empty board).
        const yen_state =
            game.moves.at(-1)?.yen_state ??
            game.initial_yen_state ??
            null;

        let gameyResponse;
        try {
            gameyResponse = await fetch(`${GAMEY_URL}/play`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    yen_state,
                    strategy:         game.strategy,
                    difficulty_level: game.difficulty_level,
                    board_size:       game.board_size,
                    variants:         game.variants,
                    // Tell Gamey whose turn it is so the first bot move is
                    // placed with the correct colour when the game started
                    // with Red (current_turn = 'R') as the first mover.
                    // Without this, Gamey defaults to Blue on an empty board,
                    // causing a colour mismatch between the DB and the board.
                    turn: game.current_turn === 'R' ? 1 : 0
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

    /**
     * PUT /:id/finish
     * Manually finishes a game with an explicit result provided by the client.
     * Used when the game ends by surrender or when the frontend detects the
     * outcome independently of Gamey's auto-detection.
     *
     * @param {string} id - MongoDB ObjectId of the game.
     * @body {string} result          - One of 'WIN', 'LOSS', or 'SURRENDERED'.
     * @body {string} [yen_final_state] - Optional final YEN board state for record-keeping.
     */
    router.put('/:id/finish', authMiddleware, async function finishGame(req, res) {
        const { result, yen_final_state } = req.body || {};
        const validResults = ['WIN', 'LOSS', 'SURRENDERED'];

        if (!result) return res.status(400).json({ error: 'result is required (WIN, LOSS or SURRENDERED)' });
        if (!validResults.includes(result)) {
            return res.status(400).json({ error: `Invalid result: ${result}. Must be one of: ${validResults.join(', ')}` });
        }

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

            await repository.updateStats(game.player_id, {
                result,
                type:     game.game_type,
                strategy: game.strategy
            });

            res.json(updatedGame);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    /**
     * GET /:id/moves
     * Returns all moves for a game sorted by move_number, used for game replay.
     *
     * @param {string} id - MongoDB ObjectId of the game.
     */
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

    /**
     * POST /:id/undo
     * Removes the last move from a game and reverts the turn.
     * Only allowed in PLAYER vs PLAYER games — not available against bots.
     *
     * @param {string} id - MongoDB ObjectId of the game.
     */
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