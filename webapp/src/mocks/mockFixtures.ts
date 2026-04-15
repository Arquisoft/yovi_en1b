import type { GameRecord } from '../types/games';

export const DEFAULT_MOCK_USER = {
  username: 'user',
  password: 'user',
  userId: 'user',
  createdAt: '2026-03-01T09:00:00.000Z',
  displayName: 'YOVI Player'
} as const;

export const SEEDED_DEFAULT_USER_GAMES: GameRecord[] = [
  {
    _id: 'seed-game-player-win',
    player_id: DEFAULT_MOCK_USER.userId,
    game_type: 'PLAYER',
    name_of_enemy: 'Alex',
    board_size: 5,
    strategy: 'random',
    variants: [],
    difficulty_level: 'medium',
    rule_set: 'normal',
    current_turn: 'R',
    status: 'FINISHED',
    result: 'WIN',
    duration_seconds: 180,
    created_at: '2026-03-16T10:00:00.000Z',
    yen_final_state: 'B/.R/BR./B..R/.....',
    moves: []
  },
  {
    _id: 'seed-game-bot-easy-win',
    player_id: DEFAULT_MOCK_USER.userId,
    game_type: 'BOT',
    name_of_enemy: null,
    board_size: 5,
    strategy: 'random',
    variants: [],
    difficulty_level: 'easy',
    rule_set: 'normal',
    current_turn: 'R',
    status: 'FINISHED',
    result: 'WIN',
    duration_seconds: 120,
    created_at: '2026-03-16T11:00:00.000Z',
    yen_final_state: 'B/.B/BR./R..R/.....',
    moves: []
  },
  {
    _id: 'seed-game-bot-medium-loss',
    player_id: DEFAULT_MOCK_USER.userId,
    game_type: 'BOT',
    name_of_enemy: null,
    board_size: 5,
    strategy: 'ai',
    variants: [],
    difficulty_level: 'medium',
    rule_set: 'normal',
    current_turn: 'B',
    status: 'FINISHED',
    result: 'LOSS',
    duration_seconds: 240,
    created_at: '2026-03-16T12:00:00.000Z',
    yen_final_state: 'R/.R/RB./B..R/.....',
    moves: []
  },
  {
    _id: 'seed-game-bot-hard-draw',
    player_id: DEFAULT_MOCK_USER.userId,
    game_type: 'BOT',
    name_of_enemy: null,
    board_size: 5,
    strategy: 'dijkstra',
    variants: [],
    difficulty_level: 'hard',
    rule_set: 'normal',
    current_turn: 'B',
    status: 'FINISHED',
    result: 'CANCELED',
    duration_seconds: 300,
    created_at: '2026-03-16T13:00:00.000Z',
    yen_final_state: 'B/.R/RB./B..R/.....',
    moves: []
  }
];
