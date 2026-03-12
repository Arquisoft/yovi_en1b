import { http, HttpResponse } from 'msw';
import type { ExistsResponse, LoginResponse, RegisterResponse } from '../types/auth';
import type { GameRecord, CreateGamePayload } from '../types/games';

const mockUsers = new Map<string, { password: string; userId: string }>();
const mockGames = new Map<string, GameRecord>();
let gameCounter = 1;

function createGameRecord(userId: string, payload: CreateGamePayload): GameRecord {
  const gameId = `game-${gameCounter++}`;
  return {
    _id: gameId,
    player_id: userId,
    game_type: payload.game_type,
    name_of_enemy: payload.name_of_enemy ?? null,
    board_size: payload.board_size,
    strategy: payload.strategy ?? 'random',
    difficulty_level: payload.difficulty_level ?? 'medium',
    rule_set: payload.rule_set ?? 'normal',
    current_turn: 'B',
    status: 'IN_PROGRESS',
    result: null,
    duration_seconds: 0,
    created_at: new Date().toISOString(),
    moves: []
  };
}

export const handlers = [
  http.get('*/exists/:username', ({ params }) => {
    const exists = mockUsers.has(params.username as string);
    return HttpResponse.json({ exists } as ExistsResponse);
  }),

  http.post('*/login', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const { username, password } = body;

    if (!username || !password) {
      return HttpResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const user = mockUsers.get(username);
    if (!user || user.password !== password) {
      return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = `mock-token-${user.userId}`;
    return HttpResponse.json({
      token,
      username,
      userId: user.userId
    } as LoginResponse);
  }),

  http.post('*/createuser', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const { username, password } = body;

    if (!username || !password) {
      return HttpResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    if (mockUsers.has(username)) {
      return HttpResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const userId = `user-${Date.now()}`;
    mockUsers.set(username, { password, userId });

    return HttpResponse.json(
      { message: `User ${username} created`, userId } as RegisterResponse,
      { status: 201 }
    );
  }),

  http.post('*/games', async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const body = (await request.json()) as CreateGamePayload;

    if (!body.board_size) {
      return HttpResponse.json({ error: 'board_size is required' }, { status: 400 });
    }

    if (body.game_type === 'PLAYER' && !body.name_of_enemy?.trim()) {
      return HttpResponse.json({ error: 'name_of_enemy is required for PLAYER games' }, { status: 400 });
    }

    // Extract userId from token (format: mock-token-{userId})
    const tokenPart = authHeader.replace('Bearer ', '');
    const userId = tokenPart.replace('mock-token-', '');

    const game = createGameRecord(userId, body);
    mockGames.set(game._id, game);

    return HttpResponse.json(game, { status: 201 });
  })
];

