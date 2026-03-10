import { requestJson } from './httpClient';
import type { CreateGamePayload, GameRecord } from '../types/games';

export async function createGame(payload: CreateGamePayload): Promise<GameRecord> {
  return requestJson<GameRecord>('/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
