import { requestJson } from './httpClient';
import type { GameHistoryItem } from '../types/games';
import type { UserProfile } from '../types/users';

export async function getUserProfile(userId: string): Promise<UserProfile> {
  return requestJson<UserProfile>(`/users/${encodeURIComponent(userId)}`);
}

export async function getUserHistory(userId: string): Promise<GameHistoryItem[]> {
  return requestJson<GameHistoryItem[]>(`/users/${encodeURIComponent(userId)}/history`);
}
