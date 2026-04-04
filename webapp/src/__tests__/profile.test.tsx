import { faker } from '@faker-js/faker';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { AuthProvider } from '../features/auth/AuthProvider';
import { server } from '../mocks/server';
import { ProfilePage } from '../pages/ProfilePage';

faker.seed(20260317);
const PROFILE_TEST_DATA = {
  authToken: faker.string.alphanumeric(24),
  userId: faker.string.alphanumeric(8),
  username: faker.internet.username().toLowerCase()
} as const;

function setSession() {
  localStorage.setItem('auth_token', PROFILE_TEST_DATA.authToken);
  localStorage.setItem('auth_user_id', PROFILE_TEST_DATA.userId);
  localStorage.setItem('auth_username', PROFILE_TEST_DATA.username);
}

function renderProfilePage() {
  setSession();
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('ProfilePage', () => {
  test('renders user statistics from /user/{id}', async () => {
    server.use(
      http.get('*/user/:id', ({ params }) =>
        HttpResponse.json({
          _id: params.id,
          username: PROFILE_TEST_DATA.username,
          created_at: '2026-03-17T10:00:00.000Z',
          statistics: {
            total_games: 10,
            total_wins: 5,
            total_losses: 3,
            total_draws: 2,
            vs_player: { wins: 2, losses: 1, draws: 1 },
            vs_bot: [
              { name: 'random', difficulty: 'easy', wins: 1, losses: 0, draws: 0 },
              { name: 'ai', difficulty: 'medium', wins: 1, losses: 1, draws: 1 },
              { name: 'dijkstra', difficulty: 'hard', wins: 1, losses: 1, draws: 0 }
            ]
          }
        })
      )
    );

    renderProfilePage();

    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: PROFILE_TEST_DATA.username })).toBeInTheDocument();
    expect(screen.getByText('Total games')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Total draws')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Win rate')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Category performance')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /vs player win rate/i })).toBeInTheDocument();
    expect(screen.getByText('4 games')).toBeInTheDocument();
    expect(screen.getByText('Random')).toBeInTheDocument();
    expect(screen.getByText('Difficulty: Easy')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /overall result split/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /ai win rate/i })).toBeInTheDocument();
  });

  test('shows backend error message', async () => {
    server.use(
      http.get('*/user/:id', () =>
        HttpResponse.json({ error: 'User not found' }, { status: 404 })
      )
    );

    renderProfilePage();

    expect(await screen.findByText(/user not found/i)).toBeInTheDocument();
  });
});
