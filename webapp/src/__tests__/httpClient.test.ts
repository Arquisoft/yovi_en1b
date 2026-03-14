import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, requestJson } from '../api/httpClient';

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function createResponse(data: unknown, ok = true, status = 200): MockResponse {
  return {
    ok,
    status,
    json: async () => data,
  };
}

describe('httpClient.requestJson', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls default API url and returns parsed JSON', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createResponse({ ok: true }) as unknown as Response);

    const data = await requestJson<{ ok: boolean }>('/health');

    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/health');
  });

  it('adds Bearer token from localStorage when missing Authorization header', async () => {
    localStorage.setItem('auth_token', 'token-123');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createResponse({ ok: true }) as unknown as Response);

    await requestJson('/secure', { method: 'GET' });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('keeps explicit Authorization header unchanged', async () => {
    localStorage.setItem('auth_token', 'token-123');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(createResponse({ ok: true }) as unknown as Response);

    await requestJson('/secure', {
      headers: { Authorization: 'Bearer external-token' },
    });

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers((init as RequestInit | undefined)?.headers);
    expect(headers.get('Authorization')).toBe('Bearer external-token');
  });

  it('throws ApiError with backend error message when response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createResponse({ error: 'Invalid token' }, false, 401) as unknown as Response,
    );

    await expect(requestJson('/secure')).rejects.toEqual(
      expect.objectContaining<ApiError>({
        name: 'ApiError',
        status: 401,
        message: 'Invalid token',
      }),
    );
  });

  it('falls back to HTTP status message when error payload is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      createResponse({ message: 'Not authorized' }, false, 403) as unknown as Response,
    );

    await expect(requestJson('/secure')).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: 'HTTP 403',
      }),
    );
  });

  it('falls back to HTTP status when response body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(requestJson('/broken')).rejects.toEqual(
      expect.objectContaining({
        status: 500,
        message: 'HTTP 500',
      }),
    );
  });

  it('returns null on successful response with invalid JSON body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('empty body');
      },
    } as unknown as Response);

    const data = await requestJson<null>('/empty');
    expect(data).toBeNull();
  });
});
