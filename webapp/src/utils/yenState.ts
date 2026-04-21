import type { Coordinates } from '../types/games';

export type CellOwner = 'B' | 'R' | null;

export type YenCellState = {
  owner: CellOwner;
  hasMine: boolean;
};

const HEX_DIRECTIONS: Coordinates[] = [
  { x: 1, y: -1, z: 0 },
  { x: 1, y: 0, z: -1 },
  { x: 0, y: 1, z: -1 },
  { x: -1, y: 1, z: 0 },
  { x: -1, y: 0, z: 1 },
  { x: 0, y: -1, z: 1 }
];

export function coordinateKey(c: Coordinates): string {
  return `${c.x}:${c.y}:${c.z}`;
}

export function isOnBoard(size: number, coordinates: Coordinates): boolean {
  return (
    coordinates.x >= 0
    && coordinates.y >= 0
    && coordinates.z >= 0
    && coordinates.x + coordinates.y + coordinates.z === size - 1
  );
}

export function getNeighborCoordinates(size: number, origin: Coordinates): Coordinates[] {
  return HEX_DIRECTIONS
    .map((delta) => ({
      x: origin.x + delta.x,
      y: origin.y + delta.y,
      z: origin.z + delta.z
    }))
    .filter((coordinates) => isOnBoard(size, coordinates));
}

export function buildEmptyYenState(size: number): string {
  const rows: string[] = [];
  for (let row = 0; row < size; row += 1) {
    rows.push('.'.repeat(row + 1));
  }
  return rows.join('/');
}

function symbolToState(symbol: string): YenCellState {
  if (symbol === 'B') {
    return { owner: 'B', hasMine: false };
  }

  if (symbol === 'R') {
    return { owner: 'R', hasMine: false };
  }

  if (symbol === 'e') {
    return { owner: null, hasMine: true };
  }

  return { owner: null, hasMine: false };
}

export function parseYenState(size: number, yenState: string | null | undefined): Map<string, YenCellState> {
  const board = new Map<string, YenCellState>();

  if (!yenState) {
    return board;
  }

  let normalizedState = yenState;
  if (yenState?.startsWith('t0|') || yenState?.startsWith('t1|')) {
    normalizedState = yenState.slice(3);
  }

  const rows = normalizedState.split('/');

  for (let row = 0; row < size; row += 1) {
    const rowState = rows[row] ?? '';

    for (let col = 0; col <= row; col += 1) {
      const coordinates: Coordinates = { x: col, y: row - col, z: size - 1 - row };
      board.set(coordinateKey(coordinates), symbolToState(rowState[col] ?? '.'));
    }
  }

  return board;
}

export function serializeYenState(size: number, stateByKey: Map<string, YenCellState>): string {
  const rows: string[] = [];

  for (let row = 0; row < size; row += 1) {
    const symbols: string[] = [];

    for (let col = 0; col <= row; col += 1) {
      const coordinates: Coordinates = { x: col, y: row - col, z: size - 1 - row };
      const cell = stateByKey.get(coordinateKey(coordinates));

      if (cell?.owner === 'B') {
        symbols.push('B');
      } else if (cell?.owner === 'R') {
        symbols.push('R');
      } else if (cell?.hasMine) {
        symbols.push('e');
      } else {
        symbols.push('.');
      }
    }

    rows.push(symbols.join(''));
  }

  return rows.join('/');
}

