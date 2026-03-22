import { requestJson } from './httpClient';
import type { UserProfile } from '../types/users';

export async function getUserProfile(userId: string): Promise<UserProfile> {
  return requestJson<UserProfile>(`/users/${encodeURIComponent(userId)}`);
}

