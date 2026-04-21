export type GameType = 'BOT' | 'PLAYER';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type VariantOption = {
  name: string;
  description: string;
  allowed_strategies?: string[];
};

export type Coordinates = {
  x: number;
  y: number;
  z: number;
};

export type Move = {
  move_number: number;
  player: 'B' | 'R';
  coordinates: Coordinates;
  yen_state?: string | null;
  created_at: string;
};

export type GameRecord = {
  _id: string;
  player_id: string;
  game_type: GameType;
  name_of_enemy: string | null;
  board_size: number;
  strategy: string;
  variants: string[];
  difficulty_level: DifficultyLevel;
  current_turn: 'B' | 'R';
  status: 'IN_PROGRESS' | 'FINISHED';
  result: 'WIN' | 'LOSS' | 'SURRENDERED' | null;
  duration_seconds: number;
  created_at: string;
  yen_final_state?: string | null;
  initial_yen_state?: string | null;
  moves: Move[];
};

export type GameHistoryItem = Omit<GameRecord, 'moves'>;

export type CreateGamePayload = {
  board_size: number;
  game_type: GameType;
  name_of_enemy?: string;
  strategy?: string;
  variants?: string[];
  difficulty_level?: DifficultyLevel;
};

export type SubmitMovePayload = {
  coordinates: Coordinates;
};

export type FinishGamePayload = {
  result: 'WIN' | 'LOSS' | 'SURRENDERED';
  duration_seconds?: number;
};

export type StrategyOption = {
  name: string;
  difficulty: string;
};

export type GameOptions = {
  strategies: StrategyOption[];
  variants: VariantOption[];
};
