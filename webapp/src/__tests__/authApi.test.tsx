import { faker } from '@faker-js/faker';
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

faker.seed(20260315);
const AUTH_TEST_DATA = {
  username: faker.internet.username().toLowerCase(),
  sessionUsername: faker.internet.username().toLowerCase(),
  secretValue: faker.string.alphanumeric(14),
  sessionToken: faker.string.alphanumeric(24),
  sessionUserId: faker.string.alphanumeric(8),
} as const;

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

    await login({ username: AUTH_TEST_DATA.username, password: AUTH_TEST_DATA.secretValue });

    expect(requestJsonMock).toHaveBeenCalledWith('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: AUTH_TEST_DATA.username,
        password: AUTH_TEST_DATA.secretValue,
      }),
    });
  });

  it('register sends POST with JSON payload', async () => {
    requestJsonMock.mockResolvedValueOnce({ message: 'ok', userId: '1' });

    await register({ username: AUTH_TEST_DATA.username, password: AUTH_TEST_DATA.secretValue });

    expect(requestJsonMock).toHaveBeenCalledWith('/createuser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: AUTH_TEST_DATA.username,
        password: AUTH_TEST_DATA.secretValue,
      }),
    });
  });

  it('saveSession and readSession persist auth data', () => {
    saveSession({
      token: AUTH_TEST_DATA.sessionToken,
      username: AUTH_TEST_DATA.sessionUsername,
      userId: AUTH_TEST_DATA.sessionUserId,
    });

    expect(localStorage.getItem(TOKEN_KEY)).toBe(AUTH_TEST_DATA.sessionToken);
    expect(readSession()).toEqual({
      token: AUTH_TEST_DATA.sessionToken,
      username: AUTH_TEST_DATA.sessionUsername,
      userId: AUTH_TEST_DATA.sessionUserId,
    });
  });

  it('clearSession removes all stored auth values', () => {
    localStorage.setItem('auth_token', AUTH_TEST_DATA.sessionToken);
    localStorage.setItem('auth_username', AUTH_TEST_DATA.sessionUsername);
    localStorage.setItem('auth_user_id', AUTH_TEST_DATA.sessionUserId);

    clearSession();

    expect(readSession()).toEqual({
      token: null,
      username: null,
      userId: null,
    });
  });
});
