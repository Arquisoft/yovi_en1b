import { requestJson } from './httpClient';
import type { GameHistoryItem } from '../types/games';
import type { UserProfile, Leaderboard } from '../types/users';

// User-facing pages consume these as read-only data loaders.
export async function getUserProfile(userId: string): Promise<UserProfile> {
  return requestJson<UserProfile>(`/users/${encodeURIComponent(userId)}`);
}

export async function getUserHistory(userId: string): Promise<GameHistoryItem[]> {
  return requestJson<GameHistoryItem[]>(`/users/${encodeURIComponent(userId)}/history`);
}

export async function getLeaderboard(): Promise<Leaderboard> {
  return requestJson<Leaderboard>('/leaderboard');
}

