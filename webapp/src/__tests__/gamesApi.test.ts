import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGame,
  finishGame,
  getGame,
  getMoves,
  playBotTurn,
  submitMove,
  undoMove,
} from '../api/gamesApi';
import { requestJson } from '../api/httpClient';

vi.mock('../api/httpClient', () => ({
  requestJson: vi.fn(),
}));

describe('gamesApi', () => {
  const requestJsonMock = vi.mocked(requestJson);

  beforeEach(() => {
    requestJsonMock.mockReset();
  });

  it('createGame sends POST with JSON payload', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: 'game-1' });

    await createGame({ board_size: 5, game_type: 'BOT', rule_set: 'normal' });

    expect(requestJsonMock).toHaveBeenCalledWith('/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_size: 5, game_type: 'BOT', rule_set: 'normal' }),
    });
  });

  it('getGame uses game id in path', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: 'game-1' });

    await getGame('game-1');

    expect(requestJsonMock).toHaveBeenCalledWith('/games/game-1');
  });

  it('getMoves calls moves endpoint', async () => {
    requestJsonMock.mockResolvedValueOnce([]);

    await getMoves('game-1');

    expect(requestJsonMock).toHaveBeenCalledWith('/games/game-1/moves');
  });

  it('submitMove sends coordinates in POST body', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: 'game-1' });

    await submitMove('game-1', { coordinates: { x: 0, y: 0, z: 4 } });

    expect(requestJsonMock).toHaveBeenCalledWith('/games/game-1/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: { x: 0, y: 0, z: 4 } }),
    });
  });

  it('playBotTurn uses /play endpoint', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: 'game-1' });

    await playBotTurn('game-1');

    expect(requestJsonMock).toHaveBeenCalledWith('/games/game-1/play');
  });

  it('undoMove uses POST without body', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: 'game-1' });

    await undoMove('game-1');

    expect(requestJsonMock).toHaveBeenCalledWith('/games/game-1/undo', { method: 'POST' });
  });

  it('finishGame sends PUT with result payload', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: 'game-1' });

    await finishGame('game-1', { result: 'DRAW', duration_seconds: 123 });

    expect(requestJsonMock).toHaveBeenCalledWith('/games/game-1/finish', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: 'DRAW', duration_seconds: 123 }),
    });
  });
});
