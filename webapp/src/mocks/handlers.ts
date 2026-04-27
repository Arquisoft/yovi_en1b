/**
 * MSW (Mock Service Worker) Handlers for Frontend Testing
 * 
 * This file defines HTTP request handlers that intercept API calls during development
 * and testing. Handlers are lightweight and return static mock data (not game logic).
 * 
 * Purpose:
 * - Enable testing without a backend server
 * - Provide consistent, predictable API responses
 * - Support development with `npm run dev:mock`
 * 
 * Architecture:
 * - In-memory storage (mockUsers, mockGames)
 * - Simple CRUD operations only
 * - No game state evaluation (board logic, winning conditions)
 * - Static test data from mockFixtures
 */

import { http, HttpResponse } from 'msw';
import type { ExistsResponse, LoginResponse, RegisterResponse } from '../types/auth';
import type { Coordinates, CreateGamePayload, GameRecord } from '../types/games';
import type { UserProfile, Leaderboard } from '../types/users';
import { DEFAULT_MOCK_USER, SEEDED_DEFAULT_USER_GAMES } from './mockFixtures';

// ─── In-Memory Storage ─────────────────────────────────────────────────────────
// Maps that simulate a simple database for testing

/** Test user credentials (username: 'user', password: 'user') */
const mockUsers = new Map<string, { password: string; userId: string }>([
  [DEFAULT_MOCK_USER.username, { password: DEFAULT_MOCK_USER.password, userId: DEFAULT_MOCK_USER.userId }]
]);

/** Game records seeded with test data (4 pre-made finished games) */
const mockGames = new Map<string, GameRecord>(
  SEEDED_DEFAULT_USER_GAMES.map((game) => [game._id, game])
);

/** Counter for generating unique game IDs */
let gameCounter = 1;

// ─── Helper Functions ──────────────────────────────────────────────────────────

/** Extract user ID from Authorization token (format: "Bearer mock-token-<userId>") */
function extractUserId(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.replace('Bearer mock-token-', '');
}

/** Retrieve a game if it belongs to the requesting user, else null (authorization check) */
function getGameForUser(gameId: string, userId: string): GameRecord | null {
  const game = mockGames.get(gameId);
  return game?.player_id === userId ? game : null;
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────
// Simple CRUD operations with static responses, no game logic evaluation

export const handlers = [
  // ──── AUTHENTICATION ────────────────────────────────────────────────────────
  
  /** POST /exists/:username - Check if username is available */
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

  // ──── USER PROFILE & STATISTICS ────────────────────────────────────────────

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
      .map(({ moves, ...rest }) => rest); // Remove moves for history

    return HttpResponse.json(history);
  }),

  // ──── LEADERBOARD & OPTIONS ────────────────────────────────────────────────

  /** GET /leaderboard - Return static mock leaderboard data */
  http.get('*/leaderboard', () => {
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

  // ──── GAME CRUD OPERATIONS ─────────────────────────────────────────────────
  // Simple store/retrieve without game logic evaluation

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

    const game: GameRecord = {
      _id: `game-${gameCounter++}`,
      player_id: userId,
      game_type: body.game_type,
      name_of_enemy: body.game_type === 'BOT' ? body.strategy : (body.name_of_enemy ?? null),
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

    // Simple mutation: just add the move, flip turn
    const move = {
      move_number: game.moves.length + 1,
      player: game.current_turn,
      coordinates,
      created_at: new Date().toISOString()
    };

    const nextGame = {
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

    const nextGame = {
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