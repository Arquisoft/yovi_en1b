export type WinLossStats = {
  wins: number;
  losses: number;
};

export type VsBotStats = {
  easy: WinLossStats;
  medium: WinLossStats;
  hard: WinLossStats;
};

export type UserStatistics = {
  total_games: number;
  total_wins: number;
  total_losses: number;
  vs_player: WinLossStats;
  vs_bot: VsBotStats;
};

export type UserProfile = {
  _id: string;
  username: string;
  created_at: string;
  statistics: UserStatistics;
};

