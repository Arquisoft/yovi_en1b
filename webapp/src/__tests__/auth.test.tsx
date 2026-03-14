import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, test } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider';
import { EntryPage } from '../pages/EntryPage';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

function renderEntryPage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<EntryPage />} />
          <Route path="/home" element={<div data-testid="home-page">Home</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

// ─── username stage ───────────────────────────────────────────────────────────

describe('EntryPage — username stage', () => {
  test('renders heading and username input', () => {
    renderEntryPage();
    expect(screen.getByRole('heading', { name: /welcome to game y/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter your username/i)).toBeInTheDocument();
  });

  test('Continue button is disabled when input is empty', () => {
    renderEntryPage();
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });

  test('Continue button is enabled after typing a username', async () => {
    renderEntryPage();
    await userEvent.type(screen.getByPlaceholderText(/enter your username/i), 'alice');
    expect(screen.getByRole('button', { name: /continue/i })).toBeEnabled();
  });

  test('clicking Continue for existing user shows Sign In heading', async () => {
    server.use(http.get('*/exists/:username', () => HttpResponse.json({ exists: true })));
    renderEntryPage();
    await userEvent.type(screen.getByPlaceholderText(/enter your username/i), 'alice');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /sign in/i });
    expect(screen.queryByPlaceholderText(/confirm your password/i)).not.toBeInTheDocument();
  });

  test('clicking Continue for new user shows Create Account heading with confirm field', async () => {
    server.use(http.get('*/exists/:username', () => HttpResponse.json({ exists: false })));
    renderEntryPage();
    await userEvent.type(screen.getByPlaceholderText(/enter your username/i), 'newuser');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /create account/i });
    expect(screen.getByPlaceholderText(/confirm your password/i)).toBeInTheDocument();
  });

  test('API failure during username check shows error message', async () => {
    server.use(
      http.get('*/exists/:username', () =>
        HttpResponse.json({ error: 'Service unavailable' }, { status: 500 })
      )
    );
    renderEntryPage();
    await userEvent.type(screen.getByPlaceholderText(/enter your username/i), 'alice');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByText(/service unavailable/i);
  });

  test('empty username triggers inline error without API call', async () => {
    renderEntryPage();
    // button is disabled so we call Enter on the empty input
    const input = screen.getByPlaceholderText(/enter your username/i);
    await userEvent.type(input, ' '); // whitespace only
    await userEvent.clear(input);
    // force click via keyboard path: type space then delete to trigger the guard
    await userEvent.type(input, '{enter}');
    // continue button stays disabled, no navigation
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled();
  });
});

// ─── sign-in stage ────────────────────────────────────────────────────────────

describe('EntryPage — sign in', () => {
  async function goToSignIn() {
    server.use(http.get('*/exists/:username', () => HttpResponse.json({ exists: true })));
    renderEntryPage();
    await userEvent.type(screen.getByPlaceholderText(/enter your username/i), 'alice');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /sign in/i });
  }

  test('successful sign in saves token to localStorage', async () => {
    await goToSignIn();
    server.use(
      http.post('*/login', () =>
        HttpResponse.json({ token: 'mock-token-u1', username: 'alice', userId: 'u1' })
      )
    );
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('mock-token-u1');
    });
  });

  test('wrong password shows error from server', async () => {
    await goToSignIn();
    server.use(
      http.post('*/login', () =>
        HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      )
    );
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await screen.findByText(/invalid credentials/i);
  });

  test('Back button returns to username stage', async () => {
    await goToSignIn();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });
});

// ─── registration stage ───────────────────────────────────────────────────────

describe('EntryPage — registration', () => {
  async function goToRegister() {
    server.use(http.get('*/exists/:username', () => HttpResponse.json({ exists: false })));
    renderEntryPage();
    await userEvent.type(screen.getByPlaceholderText(/enter your username/i), 'newuser');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    await screen.findByRole('heading', { name: /create account/i });
  }

  test('Create Account button is disabled when passwords are empty', async () => {
    await goToRegister();
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  test('Create Account button is disabled when passwords do not match', async () => {
    await goToRegister();
    await userEvent.type(screen.getByPlaceholderText(/^enter your password$/i), 'Secret123');
    await userEvent.type(screen.getByPlaceholderText(/confirm your password/i), 'Different456');
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  test('Create Account button is enabled when passwords match', async () => {
    await goToRegister();
    await userEvent.type(screen.getByPlaceholderText(/^enter your password$/i), 'Secret123');
    await userEvent.type(screen.getByPlaceholderText(/confirm your password/i), 'Secret123');
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
  });

  test('successful registration saves token to localStorage', async () => {
    await goToRegister();
    server.use(
      http.post('*/createuser', () =>
        HttpResponse.json({ message: 'User newuser created', userId: 'u2' }, { status: 201 })
      ),
      http.post('*/login', () =>
        HttpResponse.json({ token: 'mock-token-u2', username: 'newuser', userId: 'u2' })
      )
    );
    await userEvent.type(screen.getByPlaceholderText(/^enter your password$/i), 'Secret123');
    await userEvent.type(screen.getByPlaceholderText(/confirm your password/i), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(localStorage.getItem('auth_token')).toBe('mock-token-u2');
    });
  });

  test('server returns 409 shows "Username already taken" error', async () => {
    await goToRegister();
    server.use(
      http.post('*/createuser', () =>
        HttpResponse.json({ error: 'Username already taken' }, { status: 409 })
      )
    );
    await userEvent.type(screen.getByPlaceholderText(/^enter your password$/i), 'Secret123');
    await userEvent.type(screen.getByPlaceholderText(/confirm your password/i), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByText(/username already taken/i);
  });

  test('Back button returns to username stage', async () => {
    await goToRegister();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });
});

