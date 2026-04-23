import { http, HttpResponse } from 'msw';
import type { ExistsResponse, LoginResponse, RegisterResponse } from '../types/auth';
import type { Coordinates, CreateGamePayload, GameRecord, Move } from '../types/games';
import type { UserProfile, UserStatistics, WinLossStats, Leaderboard, BotLeaderboardEntry } from '../types/users';
import { DEFAULT_MOCK_USER, SEEDED_DEFAULT_USER_GAMES } from './mockFixtures';
import { buildEmptyYenState, getNeighborCoordinates, parseYenState, serializeYenState } from '../utils/yenState';

const mockUsers = new Map<string, { password: string; userId: string }>([
  [DEFAULT_MOCK_USER.username, { password: DEFAULT_MOCK_USER.password, userId: DEFAULT_MOCK_USER.userId }]
]);
const mockGames = new Map<string, GameRecord>(
    SEEDED_DEFAULT_USER_GAMES.map((game) => [game._id, game])
);
let gameCounter = 1;

const DEFAULT_STRATEGY_OPTIONS = [
  { id: 'random', name: 'random', difficulty: 'easy' },
  { id: 'ai', name: 'ai', difficulty: 'medium' },
  { id: 'dijkstra', name: 'dijkstra', difficulty: 'hard' }
] as const;

const DEFAULT_VARIANTS = [
  { name: 'Explosions', description: 'Mines are your favorite, right?', allowed_strategies: ['ai'] }
] as const;

function formatLabel(value: string): string {
  if (value.toLowerCase() === 'ai') {
    return 'AI';
  }

  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

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

function getLatestYenState(game: GameRecord): string {
  return game.moves.at(-1)?.yen_state ?? game.yen_final_state ?? buildEmptyYenState(game.board_size);
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

function createInitialYenState(size: number, variants: string[]): string {
  const map = parseYenState(size, buildEmptyYenState(size));

  if (!variants.includes('Explosions')) {
    return serializeYenState(size, map);
  }

  const mineCandidates = listBoardCoordinates(size).filter((coord) => coord.x > 0 && coord.y > 0 && coord.z > 0);
  const mineCount = Math.min(3, Math.max(1, Math.floor(size / 3)));

  for (let index = 0; index < mineCount && index < mineCandidates.length; index += 1) {
    const selected = mineCandidates[(index * 2) % mineCandidates.length];
    map.set(coordinateKey(selected), { owner: null, hasMine: true });
  }

  return serializeYenState(size, map);
}

function getFreeCoordinates(game: GameRecord): Coordinates[] {
  const currentMap = parseYenState(game.board_size, getLatestYenState(game));
  return listBoardCoordinates(game.board_size).filter((coordinates) => !currentMap.get(coordinateKey(coordinates))?.owner);
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
  const variants = payload.variants ?? [];

  return {
    _id: gameId,
    player_id: userId,
    game_type: payload.game_type,
    name_of_enemy: payload.name_of_enemy ?? null,
    board_size: payload.board_size,
    strategy: payload.strategy ?? 'random',
    variants,
    difficulty_level: payload.difficulty_level ?? 'medium',
    rule_set: payload.rule_set ?? 'normal',
    current_turn: 'B',
    status: 'IN_PROGRESS',
    result: null,
    duration_seconds: 0,
    created_at: new Date().toISOString(),
    yen_final_state: createInitialYenState(payload.board_size, variants),
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

function hasWinningConnection(state: ReturnType<typeof parseYenState>, boardSize: number, player: 'B' | 'R'): boolean {
  const owned = new Set<string>();

  for (const [key, cell] of state.entries()) {
    if (cell.owner === player) {
      owned.add(key);
    }
  }

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

      for (const neighbor of getNeighborCoordinates(boardSize, current)) {
        const neighborKey = coordinateKey(neighbor);

        if (!visited.has(neighborKey) && owned.has(neighborKey)) {
          queue.push(neighbor);
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
  const currentMap = parseYenState(game.board_size, getLatestYenState(game));
  const nextMap = new Map(currentMap);

  const targetKey = coordinateKey(coordinates);
  const target = nextMap.get(targetKey);
  const explosionsEnabled = game.variants.includes('Explosions');

  if (explosionsEnabled && target?.hasMine && !target.owner) {
    nextMap.set(targetKey, { owner: player, hasMine: false });

    for (const neighbor of getNeighborCoordinates(game.board_size, coordinates)) {
      nextMap.set(coordinateKey(neighbor), { owner: null, hasMine: false });
    }
  } else {
    nextMap.set(targetKey, { owner: player, hasMine: false });
  }

  const nextYenState = serializeYenState(game.board_size, nextMap);

  const move: Move = {
    move_number: game.moves.length + 1,
    player,
    coordinates,
    yen_state: nextYenState,
    created_at: new Date().toISOString()
  };

  const nextGame: GameRecord = {
    ...game,
    moves: [...game.moves, move],
    yen_final_state: nextYenState,
    current_turn: player === 'B' ? 'R' : 'B'
  };

  if (hasWinningConnection(nextMap, game.board_size, 'B')) {
    return { ...nextGame, status: 'FINISHED', result: 'WIN' };
  }

  if (hasWinningConnection(nextMap, game.board_size, 'R')) {
    return { ...nextGame, status: 'FINISHED', result: 'LOSS' };
  }

  const free = getFreeCoordinates(nextGame);
  return {
    ...nextGame,
    status: free.length === 0 ? 'FINISHED' : 'IN_PROGRESS',
    result: free.length === 0 ? 'CANCELED' : null
  };
}

function emptyWinLoss(): WinLossStats {
  return { wins: 0, losses: 0, draws: 0 };
}

function getUserStatistics(userId: string): UserStatistics {
  const userGames = [...mockGames.values()].filter((game) => game.player_id === userId && game.status === 'FINISHED');
  const botBuckets = new Map<string, { name: string; difficulty: string; wins: number; losses: number; draws: number }>();

  // Initialize all strategies
  for (const option of DEFAULT_STRATEGY_OPTIONS) {
    botBuckets.set(option.name, {
      name: option.name,
      difficulty: option.difficulty,
      wins: 0,
      losses: 0,
      draws: 0
    });
  }

  const stats: UserStatistics = {
    total_games: userGames.length,
    total_wins: 0,
    total_losses: 0,
    total_canceled: 0,
    vs_player: emptyWinLoss(),
    vs_bots: []
  };

  for (const game of userGames) {
    if (game.result === 'WIN') stats.total_wins += 1;
    if (game.result === 'LOSS') stats.total_losses += 1;
    if (game.result === 'CANCELED') stats.total_canceled += 1;

    if (game.game_type === 'PLAYER') {
      if (game.result === 'WIN') stats.vs_player.wins += 1;
      if (game.result === 'LOSS') stats.vs_player.losses += 1;
      if (game.result === 'CANCELED') stats.vs_player.draws += 1;
      continue;
    }

    const existing = botBuckets.get(game.strategy);
    if (existing) {
      if (game.result === 'WIN') existing.wins += 1;
      if (game.result === 'LOSS') existing.losses += 1;
      if (game.result === 'CANCELED') existing.draws += 1;
    }
  }

  stats.vs_bots = Array.from(botBuckets.values());
  return stats;
}

function buildLeaderboard(): Leaderboard {
  const userStats = new Map<
      string,
      { total_wins: number; total_games: number; botWins: Map<string, number> }
  >();

  // Aggregate stats for all users
  for (const [, user] of mockUsers) {
    const stats = getUserStatistics(user.userId);
    userStats.set(user.userId, {
      total_wins: stats.total_wins,
      total_games: stats.total_games,
      botWins: new Map(stats.vs_bots.map((bot) => [bot.name, bot.wins]))
    });
  }

  // Build overall leaderboard (top 10 by total wins)
  const overall = Array.from(mockUsers.entries())
      .map(([username, user]) => {
        const stats = userStats.get(user.userId);
        return {
          username,
          total_wins: stats?.total_wins ?? 0,
          total_games: stats?.total_games ?? 0
        };
      })
      .sort((a, b) => b.total_wins - a.total_wins)
      .slice(0, 10);

  // Build per-bot leaderboards (top 10 per strategy)
  const vs_bots: Record<string, BotLeaderboardEntry[]> = {};

  for (const strategy of DEFAULT_STRATEGY_OPTIONS.map((opt) => opt.name)) {
    vs_bots[strategy] = Array.from(mockUsers.entries())
        .map(([username, user]) => {
          const stats = userStats.get(user.userId);
          return {
            username,
            wins: stats?.botWins.get(strategy) ?? 0
          };
        })
        .filter((entry) => entry.wins > 0)
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 10);
  }

  return { overall, vs_bots };
}

export const handlers = [
  http.get('*/exists/:username', ({ params }) => {
    const exists = mockUsers.has(params.username as string);
    return HttpResponse.json({ exists } as ExistsResponse);
  }),

  http.get('*/leaderboard', () => {
    const leaderboard = buildLeaderboard();
    return HttpResponse.json(leaderboard);
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
          const copy: Partial<GameRecord> = { ...game };
          delete copy.moves;
          return copy;
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
        strategies: DEFAULT_STRATEGY_OPTIONS.map((item) => ({
          id: item.id,
          name: formatLabel(item.name),
          difficulty: formatLabel(item.difficulty)
        })),
        variants: DEFAULT_VARIANTS
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

    const currentMap = parseYenState(game.board_size, getLatestYenState(game));
    if (currentMap.get(coordinateKey(coordinates))?.owner) {
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
      const finished = { ...game, status: 'FINISHED' as const, result: 'CANCELED' as const };
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
      yen_final_state: nextMoves.at(-1)?.yen_state ?? buildEmptyYenState(game.board_size),
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

    const body = (await request.json()) as { result?: 'WIN' | 'LOSS' | 'CANCELED'; duration_seconds?: number };
    if (!body.result) {
      return HttpResponse.json({ error: 'result is required' }, { status: 400 });
    }

    const nextGame: GameRecord = {
      ...game,
      status: 'FINISHED',
      result: body.result,
      yen_final_state: game.moves.at(-1)?.yen_state ?? game.yen_final_state ?? null,
      duration_seconds: body.duration_seconds ?? game.duration_seconds
    };

    mockGames.set(nextGame._id, nextGame);
    return HttpResponse.json(nextGame);
  })
];