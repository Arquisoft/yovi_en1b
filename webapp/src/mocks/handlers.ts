import { http, HttpResponse } from 'msw';
import type { ExistsResponse, LoginResponse, RegisterResponse } from '../types/auth';

const mockUsers = new Map<string, { password: string; userId: string }>();

export const handlers = [
  http.get('*/exists/:username', ({ params }) => {
    const exists = mockUsers.has(params.username as string);
    return HttpResponse.json({ exists } as ExistsResponse);
  }),

  http.post('*/login', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const { username, password } = body;

    if (!username || !password) {
      return HttpResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const user = mockUsers.get(username);
    if (!user || user.password !== password) {
      return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = `mock-token-${user.userId}`;
    return HttpResponse.json({
      token,
      username,
      userId: user.userId
    } as LoginResponse);
  }),

  http.post('*/createuser', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    const { username, password } = body;

    if (!username || !password) {
      return HttpResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    if (mockUsers.has(username)) {
      return HttpResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    const userId = `user-${Date.now()}`;
    mockUsers.set(username, { password, userId });

    return HttpResponse.json(
      { message: `User ${username} created`, userId } as RegisterResponse,
      { status: 201 }
    );
  })
];

