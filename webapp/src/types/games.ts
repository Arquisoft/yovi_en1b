export type CreateGamePayload = {
  board_size: number;
  strategy: string;
  difficulty_level?: 'easy' | 'medium' | 'hard';
};

export type GameRecord = {
  _id: string;
  player_id: string;
  board_size: number;
  strategy: string;
  difficulty_level: string;
  status: 'IN_PROGRESS' | 'FINISHED';
  result: 'WIN' | 'LOSS' | null;
  created_at: string;
};

