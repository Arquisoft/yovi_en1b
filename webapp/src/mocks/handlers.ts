/**
 * MSW handlers for frontend development and tests.
 * They keep the mock API predictable and intentionally avoid game-state logic.
 */

import { http, HttpResponse } from 'msw';
// import type { ExistsResponse, LoginResponse, RegisterResponse } from '../types/auth';
import type { Coordinates, CreateGamePayload, GameRecord } from '../types/games';
import type { UserProfile, Leaderboard } from '../types/users';
import { DEFAULT_MOCK_USER, SEEDED_DEFAULT_USER_GAMES } from './mockFixtures';

// ─── In-Memory Storage ─────────────────────────────────────────────────────────
// Maps that simulate a simple database for testing

/** Seed user used across the mock API. */
const mockUsers = new Map<string, { password: string; userId: string }>([
  [DEFAULT_MOCK_USER.username, { password: DEFAULT_MOCK_USER.password, userId: DEFAULT_MOCK_USER.userId }]
]);

/** Seeded finished games used by profile and history views. */
const mockGames = new Map<string, GameRecord>(
  SEEDED_DEFAULT_USER_GAMES.map((game) => [game._id, game])
);

/** Simple ID counter for newly created mock games. */
let gameCounter = 1;

/** Extract user ID from the mock bearer token. */
function extractUserId(request: Request): string | null {
  // The mock token encodes the user id so the handlers can stay stateless.
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.replace('Bearer mock-token-', '');
}

/** Return a game only when it belongs to the authenticated user. */
function getGameForUser(gameId: string, userId: string): GameRecord | null {
  const game = mockGames.get(gameId);
  return game?.player_id === userId ? game : null;
}

// Simple CRUD-only HTTP handlers.

export const handlers = [
  /** GET /exists/:username - Check whether a username is already taken. */
  http.get('*/exists/:username', ({ params }) => {
    return HttpResponse.json({ exists: mockUsers.has(String(params.username)) });
  }),

  /** POST /login - Authenticate user and return token */
  http.post('*/login', async ({ request }) => {
    const { username, password } = (await request.json()) as any;
    if (!username || !password) {
      return HttpResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const user = mockUsers.get(username);
    if (!user || user.password !== password) {
      return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    return HttpResponse.json({
      token: `mock-token-${user.userId}`,
      username,
      userId: user.userId
    });
  }),

  /** POST /createuser - Register new user */
  http.post('*/createuser', async ({ request }) => {
    const { username, password } = (await request.json()) as any;
    if (!username || !password) {
      return HttpResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    if (mockUsers.has(username)) {
      return HttpResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const userId = `user-${Date.now()}`;
    mockUsers.set(username, { password, userId });
    return HttpResponse.json({ message: `User ${username} created`, userId }, { status: 201 });
  }),

  /** GET /users/:id - Fetch user profile with static statistics */
  http.get('*/users/:id', ({ params, request }) => {
    const tokenUserId = extractUserId(request);
    if (!tokenUserId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const requestedUserId = String(params.id);
    if (requestedUserId !== tokenUserId) {
      return HttpResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const usernameEntry = [...mockUsers.entries()].find(([, value]) => value.userId === requestedUserId);
    if (!usernameEntry) {
      return HttpResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Keep bot stats aligned with the real backend labels shown in the UI.
    const profile: UserProfile = {
      _id: requestedUserId,
      username: usernameEntry[0],
      created_at: DEFAULT_MOCK_USER.createdAt,
      statistics: {
        total_games: 4,
        total_wins: 2,
        total_losses: 1,
        total_surrendered: 1,
        vs_player: { wins: 1, losses: 0, surrendered: 0 },
        vs_bots: [
          { name: 'Random', difficulty: 'Easy 😄', wins: 1, losses: 0, surrendered: 0 },
          { name: 'Defensive', difficulty: 'Medium 😐', wins: 0, losses: 1, surrendered: 1 },
          { name: 'Monte Carlo', difficulty: 'Hard 😈', wins: 0, losses: 0, surrendered: 0 },
          { name: 'AI (Gemini)', difficulty: 'Medium 🤖', wins: 0, losses: 0, surrendered: 0 }
        ]
      }
    };

    return HttpResponse.json(profile);
  }),

  /** GET /users/:id/history - Fetch user's game history */
  http.get('*/users/:id/history', ({ params, request }) => {
    const tokenUserId = extractUserId(request);
    if (!tokenUserId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const requestedUserId = String(params.id);
    if (requestedUserId !== tokenUserId) {
      return HttpResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const history = [...mockGames.values()]
      .filter((game) => game.player_id === requestedUserId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      // The list endpoint returns summaries only; move details are loaded separately.
      .map(({ moves, ...rest }) => rest);

    return HttpResponse.json(history);
  }),

  /** GET /leaderboard - Return static mock leaderboard data */
  http.get('*/leaderboard', () => {
    // The leaderboard uses the same display names as the profile view.
    const leaderboard: Leaderboard = {
      overall: [
        { username: 'user', total_wins: 2, total_games: 4 },
        { username: 'Champion', total_wins: 10, total_games: 15 }
      ],
      vs_bots: {
        Random: [{ username: 'user', wins: 1 }],
        Defensive: [{ username: 'Champion', wins: 5 }],
        'Monte Carlo': [{ username: 'Champion', wins: 4 }],
        'AI (Gemini)': [{ username: 'Champion', wins: 3 }]
      }
    };
    return HttpResponse.json(leaderboard);
  }),

  /** GET /games/options - Return available strategies and game variants */
  http.get('*/games/options', () => {
    // Strategy ids match the backend, while names are what the UI renders.
    return HttpResponse.json({
      strategies: [
        { id: 'random', name: 'Random', difficulty: 'Easy 😄' },
        { id: 'defensive', name: 'Defensive', difficulty: 'Medium 😐' },
        { id: 'mcts', name: 'Monte Carlo', difficulty: 'Hard 😈' },
        { id: 'ai', name: 'AI (Gemini)', difficulty: 'Medium 🤖' }
      ],
      variants: [{ name: 'Explosions', description: 'Mines are your favorite, right?', allowed_strategies: ['ai'] }]
    });
  }),

  /** POST /games - Create a new game */
  http.post('*/games', async ({ request }) => {
    const userId = extractUserId(request);
    if (!userId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const body = (await request.json()) as CreateGamePayload;
    if (!body.board_size) {
      return HttpResponse.json({ error: 'board_size is required' }, { status: 400 });
    }

    if (body.game_type === 'PLAYER' && !body.name_of_enemy?.trim()) {
      return HttpResponse.json({ error: 'name_of_enemy is required for PLAYER games' }, { status: 400 });
    }

    // BOT games keep the selected bot label in name_of_enemy for the UI.
    // This mirrors the backend shape used by the frontend labels and history view.
    const game: GameRecord = {
      _id: `game-${gameCounter++}`,
      player_id: userId,
      game_type: body.game_type,
      // BOT games keep the selected bot label in name_of_enemy for the UI.
      name_of_enemy: body.game_type === 'BOT' ? (body.strategy ?? null) : (body.name_of_enemy ?? null),
      board_size: body.board_size,
      strategy: body.strategy ?? 'random',
      variants: body.variants ?? [],
      difficulty_level: body.difficulty_level ?? 'medium',
      rule_set: body.rule_set ?? 'normal',
      current_turn: 'B',
      status: 'IN_PROGRESS',
      result: null,
      duration_seconds: 0,
      created_at: new Date().toISOString(),
      yen_final_state: '',
      moves: []
    };

    mockGames.set(game._id, game);
    return HttpResponse.json(game, { status: 201 });
  }),

  /** GET /games/:id - Retrieve a specific game */
  http.get('*/games/:id', ({ params, request }) => {
    const userId = extractUserId(request);
    if (!userId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const game = getGameForUser(String(params.id), userId);
    if (!game) {
      return HttpResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return HttpResponse.json(game);
  }),

  /** GET /games/:id/moves - Fetch all moves for a game */
  http.get('*/games/:id/moves', ({ params, request }) => {
    const userId = extractUserId(request);
    if (!userId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const game = getGameForUser(String(params.id), userId);
    if (!game) {
      return HttpResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return HttpResponse.json(game.moves);
  }),

  /** POST /games/:id/move - Record a player move (no validation, just store) */
  http.post('*/games/:id/move', async ({ params, request }) => {
    const userId = extractUserId(request);
    if (!userId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const game = getGameForUser(String(params.id), userId);
    if (!game) {
      return HttpResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (game.status === 'FINISHED') {
      return HttpResponse.json({ error: 'Game is already finished' }, { status: 400 });
    }

    const body = (await request.json()) as { coordinates?: Coordinates };
    const coordinates = body.coordinates;

    if (!coordinates) {
      return HttpResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    // Keep the mock deterministic: record the move and flip the turn only.
    const move = {
      move_number: game.moves.length + 1,
      player: game.current_turn,
      coordinates,
      created_at: new Date().toISOString()
    };

    const nextGame: GameRecord = {
      ...game,
      moves: [...game.moves, move],
      current_turn: game.current_turn === 'B' ? 'R' : 'B'
    };

    mockGames.set(nextGame._id, nextGame);
    return HttpResponse.json(nextGame, { status: 201 });
  }),

  /** POST /games/:id/undo - Remove the last move from a game */
  http.post('*/games/:id/undo', ({ params, request }) => {
    const userId = extractUserId(request);
    if (!userId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const game = getGameForUser(String(params.id), userId);
    if (!game) {
      return HttpResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (game.moves.length === 0) {
      return HttpResponse.json({ error: 'No move to undo' }, { status: 400 });
    }

    const nextGame: GameRecord = {
      ...game,
      moves: game.moves.slice(0, -1),
      current_turn: game.moves.length % 2 === 1 ? 'R' : 'B'
    };

    mockGames.set(nextGame._id, nextGame);
    return HttpResponse.json(nextGame);
  }),

  /** GET /games/:id/play - Simulate bot's turn (just flip turn to Blue) */
  http.get('*/games/:id/play', ({ params, request }) => {
    const userId = extractUserId(request);
    if (!userId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const game = getGameForUser(String(params.id), userId);
    if (!game) {
      return HttpResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    if (game.status === 'FINISHED') {
      return HttpResponse.json({ error: 'Game is already finished' }, { status: 400 });
    }

    if (game.game_type !== 'BOT' || game.current_turn !== 'R') {
      return HttpResponse.json({ error: 'Bot move is not available right now' }, { status: 400 });
    }

    // The mock only advances turn state; it does not simulate bot decision making.
    const nextGame = {
      ...game,
      current_turn: 'B' as const
    };

    mockGames.set(nextGame._id, nextGame);
    return HttpResponse.json(nextGame);
  }),

  /** PUT /games/:id/finish - Mark game as finished with result (WIN/LOSS/SURRENDERED) */
  http.put('*/games/:id/finish', async ({ params, request }) => {
    const userId = extractUserId(request);
    if (!userId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const game = getGameForUser(String(params.id), userId);
    if (!game) {
      return HttpResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const body = (await request.json()) as { result?: string; duration_seconds?: number };
    if (!body.result) {
      return HttpResponse.json({ error: 'result is required' }, { status: 400 });
    }

    // Finishing the match is a pure status update with no extra game logic.
    const nextGame = {
      ...game,
      status: 'FINISHED' as const,
      result: body.result as any,
      duration_seconds: body.duration_seconds ?? game.duration_seconds
    };

    mockGames.set(nextGame._id, nextGame);
    return HttpResponse.json(nextGame);
  })
];