/**
 * Gamey Bot API Client
 * Handles communication with the gamey backend service
 */

import type { BotMoveResponse, GameState } from '../types/gamey';

export class GameyApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameyApiError';
  }
}

const GAMEY_URL = (import.meta.env.VITE_GAMEY_URL || 'http://localhost:4000').replace(/\/$/, '');

/**
 * Request a move from a bot
 */
export async function getBotMove(
  botId: string,
  gameState: GameState,
  apiVersion: string = 'v1'
): Promise<BotMoveResponse> {
  const url = `${GAMEY_URL}/${apiVersion}/ybot/choose/${botId}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(gameState),
  });

  let data: any;
  try {
    data = await response.json();
  } catch (e) {
    throw new GameyApiError(`Failed to parse response: ${e instanceof Error ? e.message : 'Invalid JSON'}`);
  }

  if (!response.ok) {
    throw new GameyApiError(data?.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  // Validate response structure
  if (!data?.coords || typeof data.coords.x !== 'number' || typeof data.coords.y !== 'number' || typeof data.coords.z !== 'number') {
    console.log('Invalid response structure:', data);
    throw new GameyApiError(`Invalid response structure. Got: ${JSON.stringify(data)}`);
  }

  return data as BotMoveResponse;
}

/**
 * Create an empty game board for testing
 */
export function createEmptyBoard(size: number = 3): GameState {
  const rows = Array.from({ length: size }, (_, i) => '.'.repeat(i + 1));
  return {
    size,
    turn: 0,
    players: ['B', 'R'],
    layout: rows.join('/'),
  };
}
