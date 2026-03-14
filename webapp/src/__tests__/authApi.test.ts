import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOKEN_KEY,
  checkUsernameExists,
  clearSession,
  login,
  readSession,
  register,
  saveSession,
} from '../api/authApi';
import { requestJson } from '../api/httpClient';

vi.mock('../api/httpClient', () => ({
  requestJson: vi.fn(),
}));

describe('authApi', () => {
  const requestJsonMock = vi.mocked(requestJson);

  beforeEach(() => {
    requestJsonMock.mockReset();
    localStorage.clear();
  });

  it('checkUsernameExists encodes username in URL', async () => {
    requestJsonMock.mockResolvedValueOnce({ exists: true });

    await checkUsernameExists('john doe');

    expect(requestJsonMock).toHaveBeenCalledWith('/exists/john%20doe');
  });

  it('login sends POST with JSON payload', async () => {
    requestJsonMock.mockResolvedValueOnce({ token: 't', username: 'u', userId: '1' });

    await login({ username: 'john', password: 'secret' });

    expect(requestJsonMock).toHaveBeenCalledWith('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'john', password: 'secret' }),
    });
  });

  it('register sends POST with JSON payload', async () => {
    requestJsonMock.mockResolvedValueOnce({ message: 'ok', userId: '1' });

    await register({ username: 'john', password: 'secret' });

    expect(requestJsonMock).toHaveBeenCalledWith('/createuser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'john', password: 'secret' }),
    });
  });

  it('saveSession and readSession persist auth data', () => {
    saveSession({ token: 'token-1', username: 'alice', userId: 'u1' });

    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-1');
    expect(readSession()).toEqual({
      token: 'token-1',
      username: 'alice',
      userId: 'u1',
    });
  });

  it('clearSession removes all stored auth values', () => {
    localStorage.setItem('auth_token', 'token-1');
    localStorage.setItem('auth_username', 'alice');
    localStorage.setItem('auth_user_id', 'u1');

    clearSession();

    expect(readSession()).toEqual({
      token: null,
      username: null,
      userId: null,
    });
  });
});
