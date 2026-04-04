export type WinLossStats = {
  wins: number;
  losses: number;
  draws: number;
};

export type BotStatsItem = {
  name: string;
  difficulty: string;
  wins: number;
  losses: number;
  draws: number;
};

export type UserStatistics = {
  total_games: number;
  total_wins: number;
  total_losses: number;
  total_draws: number;
  vs_player: WinLossStats;
  vs_bot: BotStatsItem[];
};

export type UserProfile = {
  _id: string;
  username: string;
  created_at: string;
  statistics: UserStatistics;
};
