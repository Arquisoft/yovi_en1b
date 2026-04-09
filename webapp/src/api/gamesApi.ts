import { requestJson } from './httpClient';
import type {
  CreateGamePayload,
  FinishGamePayload,
  GameOptions,
  GameRecord,
  Move,
  SubmitMovePayload
} from '../types/games';

export async function createGame(payload: CreateGamePayload): Promise<GameRecord> {
  return requestJson<GameRecord>('/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function getGame(gameId: string): Promise<GameRecord> {
  return requestJson<GameRecord>(`/games/${gameId}`);
}

export async function getMoves(gameId: string): Promise<Move[]> {
  return requestJson<Move[]>(`/games/${gameId}/moves`);
}

export async function submitMove(gameId: string, payload: SubmitMovePayload): Promise<GameRecord> {
  return requestJson<GameRecord>(`/games/${gameId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function playBotTurn(gameId: string): Promise<GameRecord> {
  return requestJson<GameRecord>(`/games/${gameId}/play`);
}

export async function undoMove(gameId: string): Promise<GameRecord> {
  return requestJson<GameRecord>(`/games/${gameId}/undo`, {
    method: 'POST'
  });
}

export async function finishGame(gameId: string, payload: FinishGamePayload): Promise<GameRecord> {
  return requestJson<GameRecord>(`/games/${gameId}/finish`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function getGameOptions(): Promise<GameOptions> {
  return requestJson<GameOptions>('/games/options');
}
