import { faker } from '@faker-js/faker';
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

faker.seed(20260319);
const GAMES_API_TEST_DATA = {
  gameId: faker.string.alphanumeric(10),
} as const;

vi.mock('../api/httpClient', () => ({
  requestJson: vi.fn(),
}));

describe('gamesApi', () => {
  const requestJsonMock = vi.mocked(requestJson);

  beforeEach(() => {
    requestJsonMock.mockReset();
  });

  it('createGame sends POST with JSON payload', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: GAMES_API_TEST_DATA.gameId });

    await createGame({ board_size: 5, game_type: 'BOT', rule_set: 'normal' });

    expect(requestJsonMock).toHaveBeenCalledWith('/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board_size: 5, game_type: 'BOT', rule_set: 'normal' }),
    });
  });

  it('getGame uses game id in path', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: GAMES_API_TEST_DATA.gameId });

    await getGame(GAMES_API_TEST_DATA.gameId);

    expect(requestJsonMock).toHaveBeenCalledWith(`/games/${GAMES_API_TEST_DATA.gameId}`);
  });

  it('getMoves calls moves endpoint', async () => {
    requestJsonMock.mockResolvedValueOnce([]);

    await getMoves(GAMES_API_TEST_DATA.gameId);

    expect(requestJsonMock).toHaveBeenCalledWith(`/games/${GAMES_API_TEST_DATA.gameId}/moves`);
  });

  it('submitMove sends coordinates in POST body', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: GAMES_API_TEST_DATA.gameId });

    await submitMove(GAMES_API_TEST_DATA.gameId, { coordinates: { x: 0, y: 0, z: 4 } });

    expect(requestJsonMock).toHaveBeenCalledWith(`/games/${GAMES_API_TEST_DATA.gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: { x: 0, y: 0, z: 4 } }),
    });
  });

  it('playBotTurn uses /play endpoint', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: GAMES_API_TEST_DATA.gameId });

    await playBotTurn(GAMES_API_TEST_DATA.gameId);

    expect(requestJsonMock).toHaveBeenCalledWith(`/games/${GAMES_API_TEST_DATA.gameId}/play`);
  });

  it('undoMove uses POST without body', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: GAMES_API_TEST_DATA.gameId });

    await undoMove(GAMES_API_TEST_DATA.gameId);

    expect(requestJsonMock).toHaveBeenCalledWith(`/games/${GAMES_API_TEST_DATA.gameId}/undo`, { method: 'POST' });
  });

  it('finishGame sends PUT with result payload', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: GAMES_API_TEST_DATA.gameId });

    await finishGame(GAMES_API_TEST_DATA.gameId, { result: 'DRAW', duration_seconds: 123 });

    expect(requestJsonMock).toHaveBeenCalledWith(`/games/${GAMES_API_TEST_DATA.gameId}/finish`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: 'DRAW', duration_seconds: 123 }),
    });
  });
});
