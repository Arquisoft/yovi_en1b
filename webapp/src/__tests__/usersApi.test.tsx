import { faker } from '@faker-js/faker';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../api/httpClient';
import { getUserProfile } from '../api/usersApi';

faker.seed(20260317);
const USERS_API_TEST_DATA = {
  userId: faker.string.alphanumeric(10)
} as const;

vi.mock('../api/httpClient', () => ({
  requestJson: vi.fn()
}));

describe('usersApi', () => {
  const requestJsonMock = vi.mocked(requestJson);

  beforeEach(() => {
    requestJsonMock.mockReset();
  });

  it('getUserProfile uses /users/{id} endpoint', async () => {
    requestJsonMock.mockResolvedValueOnce({ _id: USERS_API_TEST_DATA.userId });

    await getUserProfile(USERS_API_TEST_DATA.userId);

    expect(requestJsonMock).toHaveBeenCalledWith(`/users/${USERS_API_TEST_DATA.userId}`);
  });
});

