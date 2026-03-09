import { requestJson } from './httpClient';
import type { LoginPayload, LoginResponse, RegisterPayload, RegisterResponse } from '../types/auth';

export const TOKEN_KEY = 'auth_token';
const USERNAME_KEY = 'auth_username';
const USER_ID_KEY = 'auth_user_id';

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  return requestJson<RegisterResponse>('/createuser', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  return requestJson<LoginResponse>('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export function saveSession(session: LoginResponse): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USERNAME_KEY, session.username);
  localStorage.setItem(USER_ID_KEY, session.userId);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

export function readSession() {
  return {
    token: localStorage.getItem(TOKEN_KEY),
    username: localStorage.getItem(USERNAME_KEY),
    userId: localStorage.getItem(USER_ID_KEY)
  };
}
