import { http, HttpResponse } from 'msw';

const users = new Map<string, { userId: string; username: string; password: string }>();

function createJwtLikeToken(username: string, userId: string) {
  const payloadJson = JSON.stringify({ sub: userId, username });
  const payload = typeof btoa === 'function' ? btoa(payloadJson) : Buffer.from(payloadJson, 'utf8').toString('base64');
  return `mock.${payload}.token`;
}

export function resetMockState() {
  users.clear();
}

export const handlers = [
  http.post('*/verifyname', async ({ request }) => {
    const body = (await request.json()) as { username?: string };
    const username = body.username?.trim();
    if (!username) {
      return HttpResponse.json({ error: 'Username is required' }, { status: 400 });
    }
    return HttpResponse.json({ exists: users.has(username) });
  }),

  http.post('*/createuser', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username?.trim();
    const password = body.password;

    if (!username || !password) {
      return HttpResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    if (users.has(username)) {
      return HttpResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const userId = `mock-${users.size + 1}`;
    users.set(username, { userId, username, password });

    return HttpResponse.json({ message: `Welcome ${username}!`, userId }, { status: 201 });
  }),

  http.post('*/login', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const username = body.username?.trim();
    const password = body.password;

    if (!username || !password) {
      return HttpResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const existing = users.get(username);
    if (!existing || existing.password !== password) {
      return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    return HttpResponse.json({
      token: createJwtLikeToken(existing.username, existing.userId),
      username: existing.username,
      userId: existing.userId
    });
  }),

  http.post('*/v1/ybot/choose/:botId', async ({ request }) => {
    const body = (await request.json()) as { free_coords?: Array<{ x: number; y: number; z: number }> };
    const firstFree = body.free_coords?.[0];

    if (!firstFree) {
      return HttpResponse.json({ error: 'No available move' }, { status: 400 });
    }

    return HttpResponse.json({ coords: firstFree });
  })
];
