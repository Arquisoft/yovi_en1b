export type WinLossStats = {
  wins: number;
  losses: number;
  draws: number;
};

export type BotStat = {
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
  vs_bots: BotStat[];
};

export type UserProfile = {
  _id: string;
  username: string;
  created_at: string;
  statistics: UserStatistics;
};

export type LeaderboardEntry = {
  username: string;
  total_wins: number;
  total_games: number;
};

export type BotLeaderboardEntry = {
  username: string;
  wins: number;
};

export type Leaderboard = {
  overall: LeaderboardEntry[];
  vs_bots: Record<string, BotLeaderboardEntry[]>;
};

