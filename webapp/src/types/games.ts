export type GameType = 'BOT' | 'PLAYER';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type Coordinates = {
  x: number;
  y: number;
  z: number;
};

export type Move = {
  move_number: number;
  player: 'B' | 'R';
  coordinates: Coordinates;
  created_at: string;
};

export type GameRecord = {
  _id: string;
  player_id: string;
  game_type: GameType;
  name_of_enemy: string | null;
  board_size: number;
  strategy: string;
  difficulty_level: DifficultyLevel;
  current_turn: 'B' | 'R';
  status: 'IN_PROGRESS' | 'FINISHED';
  result: 'WIN' | 'LOSS' | 'DRAW' | null;
  duration_seconds: number;
  created_at: string;
  moves: Move[];
};

export type CreateGamePayload = {
  board_size: number;
  game_type: GameType;
  name_of_enemy?: string;
  strategy?: string;
  difficulty_level?: DifficultyLevel;
};

export type SubmitMovePayload = {
  coordinates: Coordinates;
};

export type FinishGamePayload = {
  result: 'WIN' | 'LOSS' | 'DRAW';
  duration_seconds?: number;
};
