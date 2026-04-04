import { http, HttpResponse } from 'msw';
import type { ExistsResponse, LoginResponse, RegisterResponse } from '../types/auth';
import type { Coordinates, CreateGamePayload, GameRecord, Move } from '../types/games';
import type { UserProfile, UserStatistics, WinLossStats } from '../types/users';
import { DEFAULT_MOCK_USER, SEEDED_DEFAULT_USER_GAMES } from './mockFixtures';

const mockUsers = new Map<string, { password: string; userId: string }>([
  [DEFAULT_MOCK_USER.username, { password: DEFAULT_MOCK_USER.password, userId: DEFAULT_MOCK_USER.userId }]
]);
const mockGames = new Map<string, GameRecord>(
  SEEDED_DEFAULT_USER_GAMES.map((game) => [game._id, game])
);
let gameCounter = 1;

function coordinateKey(c: Coordinates): string {
  return `${c.x}:${c.y}:${c.z}`;
}

function isOnBoard(size: number, coordinates: Coordinates): boolean {
  return (
    coordinates.x >= 0 &&
    coordinates.y >= 0 &&
    coordinates.z >= 0 &&
    coordinates.x + coordinates.y + coordinates.z === size - 1
  );
}

function listBoardCoordinates(size: number): Coordinates[] {
  const all: Coordinates[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      all.push({ x: column, y: row - column, z: size - 1 - row });
    }
  }
  return all;
}

function getFreeCoordinates(game: GameRecord): Coordinates[] {
  const occupied = new Set(game.moves.map((move) => coordinateKey(move.coordinates)));
  return listBoardCoordinates(game.board_size).filter((coordinates) => !occupied.has(coordinateKey(coordinates)));
}

function extractUserId(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const tokenPart = authHeader.replace('Bearer ', '');
  return tokenPart.replace('mock-token-', '');
}

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

function getGameForUser(gameId: string, userId: string): GameRecord | null {
  const game = mockGames.get(gameId);
  if (!game || game.player_id !== userId) {
    return null;
  }
  return game;
}

const HEX_DIRECTIONS: Coordinates[] = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 }
];

function hasWinningConnection(game: GameRecord, player: 'B' | 'R'): boolean {
  const owned = new Set(
    game.moves
      .filter((move) => move.player === player)
      .map((move) => coordinateKey(move.coordinates))
  );

  const visited = new Set<string>();

  for (const start of owned) {
    if (visited.has(start)) {
      continue;
    }

    const [x, y, z] = start.split(':').map(Number);
    const queue: Coordinates[] = [{ x, y, z }];
    const touched = new Set<'x' | 'y' | 'z'>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const key = coordinateKey(current);
      if (visited.has(key)) {
        continue;
      }

      visited.add(key);

      if (current.x === 0) touched.add('x');
      if (current.y === 0) touched.add('y');
      if (current.z === 0) touched.add('z');

      for (const delta of HEX_DIRECTIONS) {
        const next = {
          x: current.x + delta.x,
          y: current.y + delta.y,
          z: current.z + delta.z
        };

        if (!isOnBoard(game.board_size, next)) {
          continue;
        }

        const nextKey = coordinateKey(next);
        if (!visited.has(nextKey) && owned.has(nextKey)) {
          queue.push(next);
        }
      }
    }

    if (touched.size === 3) {
      return true;
    }
  }

  return false;
}

function appendMove(game: GameRecord, coordinates: Coordinates, player: 'B' | 'R'): GameRecord {
  const move: Move = {
    move_number: game.moves.length + 1,
    player,
    coordinates,
    created_at: new Date().toISOString()
  };

  const nextMoves = [...game.moves, move];
  const nextGame: GameRecord = {
    ...game,
    moves: nextMoves,
    current_turn: player === 'B' ? 'R' : 'B'
  };

  if (hasWinningConnection(nextGame, 'B')) {
    return {
      ...nextGame,
      status: 'FINISHED',
      result: 'WIN'
    };
  }

  if (hasWinningConnection(nextGame, 'R')) {
    return {
      ...nextGame,
      status: 'FINISHED',
      result: 'LOSS'
    };
  }

  const free = getFreeCoordinates(nextGame);
  return {
    ...nextGame,
    status: free.length === 0 ? 'FINISHED' : 'IN_PROGRESS',
    result: free.length === 0 ? 'DRAW' : null
  };
}

function emptyWinLoss(): WinLossStats {
  return { wins: 0, losses: 0, draws: 0 };
}

function getUserStatistics(userId: string): UserStatistics {
  const userGames = [...mockGames.values()].filter((game) => game.player_id === userId && game.status === 'FINISHED');

  const stats: UserStatistics = {
    total_games: userGames.length,
    total_wins: 0,
    total_losses: 0,
    total_draws: 0,
    vs_player: emptyWinLoss(),
    vs_bot: {
      easy: emptyWinLoss(),
      medium: emptyWinLoss(),
      hard: emptyWinLoss()
    }
  };

  for (const game of userGames) {
    if (game.result === 'WIN') {
      stats.total_wins += 1;
    }

    if (game.result === 'LOSS') {
      stats.total_losses += 1;
    }

    if (game.result === 'DRAW') {
      stats.total_draws += 1;
    }

    if (game.game_type === 'PLAYER') {
      if (game.result === 'WIN') stats.vs_player.wins += 1;
      if (game.result === 'LOSS') stats.vs_player.losses += 1;
      if (game.result === 'DRAW') stats.vs_player.draws += 1;
      continue;
    }

    const bucket = stats.vs_bot[game.difficulty_level];
    if (game.result === 'WIN') bucket.wins += 1;
    if (game.result === 'LOSS') bucket.losses += 1;
    if (game.result === 'DRAW') bucket.draws += 1;
  }

  return stats;
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

    return HttpResponse.json({
      token: `mock-token-${user.userId}`,
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

    return HttpResponse.json({ message: `User ${username} created`, userId } as RegisterResponse, { status: 201 });
  }),

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
      statistics: getUserStatistics(requestedUserId)
    };

    return HttpResponse.json(profile);
  }),

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
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .map((game) => {
        const rest = { ...game };
        delete rest.moves;
        return rest;
      });

    return HttpResponse.json(history);
  }),

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

    const game = createGameRecord(userId, body);
    mockGames.set(game._id, game);

    return HttpResponse.json(game, { status: 201 });
  }),

  http.get('*/games/options', () =>
    HttpResponse.json({
      strategies: [
        { name: 'Random', difficulty: 'Easy' },
        { name: 'AI', difficulty: 'Medium' },
        { name: 'Dijkstra', difficulty: 'Hard' }
      ],
      variants: ['Classic Y', 'Master Y (coming soon)', 'Pie Rule (coming soon)']
    })
  ),

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

    if (!coordinates || !isOnBoard(game.board_size, coordinates)) {
      return HttpResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    if (game.moves.some((move) => coordinateKey(move.coordinates) === coordinateKey(coordinates))) {
      return HttpResponse.json({ error: 'Coordinate is already occupied' }, { status: 400 });
    }

    const nextGame = appendMove(game, coordinates, game.current_turn);
    mockGames.set(nextGame._id, nextGame);

    return HttpResponse.json(nextGame, { status: 201 });
  }),

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

    const free = getFreeCoordinates(game);
    if (free.length === 0) {
      const finished = { ...game, status: 'FINISHED' as const, result: 'DRAW' as const };
      mockGames.set(finished._id, finished);
      return HttpResponse.json(finished);
    }

    const botCoordinates = free[0];
    const nextGame = appendMove(game, botCoordinates, 'R');
    mockGames.set(nextGame._id, nextGame);

    return HttpResponse.json(nextGame);
  }),

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

    const nextMoves = game.moves.slice(0, game.moves.length - 1);
    const nextGame: GameRecord = {
      ...game,
      moves: nextMoves,
      current_turn: nextMoves.length % 2 === 0 ? 'B' : 'R',
      status: 'IN_PROGRESS',
      result: null
    };

    mockGames.set(nextGame._id, nextGame);
    return HttpResponse.json(nextGame);
  }),

  http.put('*/games/:id/finish', async ({ params, request }) => {
    const userId = extractUserId(request);
    if (!userId) {
      return HttpResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const game = getGameForUser(String(params.id), userId);
    if (!game) {
      return HttpResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const body = (await request.json()) as { result?: 'WIN' | 'LOSS' | 'DRAW'; duration_seconds?: number };
    if (!body.result) {
      return HttpResponse.json({ error: 'result is required' }, { status: 400 });
    }

    const nextGame: GameRecord = {
      ...game,
      status: 'FINISHED',
      result: body.result,
      duration_seconds: body.duration_seconds ?? game.duration_seconds
    };

    mockGames.set(nextGame._id, nextGame);
    return HttpResponse.json(nextGame);
  })
];
