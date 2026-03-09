import { afterEach, describe, expect, test } from 'vitest';
import { register, login } from '../api/authApi';
import { ApiError } from '../api/httpClient';

describe('MSW auth flow', () => {
  afterEach(() => {
    localStorage.clear();
  });

  test('register + login works against mocked API', async () => {
    const username = `user-${Date.now()}`;
    const password = 'secret';

    const registerResult = await register({ username, password });
    expect(registerResult.userId).toMatch(/^mock-/);

    const loginResult = await login({ username, password });
    expect(loginResult.username).toBe(username);
    expect(loginResult.token).toContain('mock.');
  });

  test('login fails with unknown user', async () => {
    await expect(login({ username: 'missing-user', password: 'bad' })).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: 'ApiError',
        status: 401,
        message: 'Invalid credentials'
      })
    );
  });
});

