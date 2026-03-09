import type { GameState } from '../types/gamey';

export function createEmptyBoard(size: number = 3): GameState {
  const rows = Array.from({ length: size }, (_, i) => '.'.repeat(i + 1));

  return {
    size,
    turn: 0,
    players: ['B', 'R'],
    layout: rows.join('/')
  };
}

