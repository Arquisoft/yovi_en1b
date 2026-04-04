import { faker } from '@faker-js/faker';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider';
import { GameHistoryPage } from '../pages/GameHistoryPage';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

faker.seed(20260404);
const HISTORY_TEST_DATA = {
  userId: 'user',
  authToken: faker.string.alphanumeric(24),
  gameIdA: faker.string.alphanumeric(10),
  gameIdB: faker.string.alphanumeric(10)
} as const;

function setSession() {
  localStorage.setItem('auth_token', HISTORY_TEST_DATA.authToken);
  localStorage.setItem('auth_username', 'user');
  localStorage.setItem('auth_user_id', HISTORY_TEST_DATA.userId);
}

function renderHistoryPage() {
  setSession();
  return render(
    <MemoryRouter initialEntries={['/games/history']}>
      <AuthProvider>
        <Routes>
          <Route path="/games/history" element={<GameHistoryPage />} />
          <Route path="/games/:id" element={<div>Game details</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('GameHistoryPage', () => {
  test('shows played games list from history endpoint', async () => {
    server.use(
      http.get('*/users/:id/history', () =>
        HttpResponse.json([
          {
            _id: HISTORY_TEST_DATA.gameIdA,
            player_id: HISTORY_TEST_DATA.userId,
            game_type: 'BOT',
            name_of_enemy: null,
            board_size: 7,
            strategy: 'random',
            difficulty_level: 'easy',
            rule_set: 'normal',
            current_turn: 'B',
            status: 'FINISHED',
            result: 'WIN',
            duration_seconds: 95,
            created_at: '2026-04-04T10:00:00.000Z'
          },
          {
            _id: HISTORY_TEST_DATA.gameIdB,
            player_id: HISTORY_TEST_DATA.userId,
            game_type: 'PLAYER',
            name_of_enemy: 'Marek',
            board_size: 5,
            strategy: 'ai',
            difficulty_level: 'hard',
            rule_set: 'normal',
            current_turn: 'R',
            status: 'FINISHED',
            result: 'LOSS',
            duration_seconds: 121,
            created_at: '2026-04-03T10:00:00.000Z'
          }
        ])
      ),
      http.get(`*/games/${HISTORY_TEST_DATA.gameIdA}/moves`, () =>
        HttpResponse.json([
          { move_number: 1, player: 'B', coordinates: { x: 0, y: 0, z: 6 }, created_at: new Date().toISOString() },
          { move_number: 2, player: 'R', coordinates: { x: 0, y: 1, z: 5 }, created_at: new Date().toISOString() }
        ])
      ),
      http.get(`*/games/${HISTORY_TEST_DATA.gameIdB}/moves`, () =>
        HttpResponse.json([
          { move_number: 1, player: 'B', coordinates: { x: 0, y: 0, z: 4 }, created_at: new Date().toISOString() }
        ])
      )
    );

    renderHistoryPage();

    expect(await screen.findByLabelText('Played games history')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Marek')).toBeInTheDocument();
    expect(screen.getByText('easy')).toBeInTheDocument();
    expect(screen.getByText('random')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('hard')).not.toBeInTheDocument();
    expect(screen.queryByText('ai')).not.toBeInTheDocument();
  });

  test('opens game when card button is clicked', async () => {
    server.use(
      http.get('*/users/:id/history', () =>
        HttpResponse.json([
          {
            _id: HISTORY_TEST_DATA.gameIdA,
            player_id: HISTORY_TEST_DATA.userId,
            game_type: 'BOT',
            name_of_enemy: null,
            board_size: 7,
            strategy: 'random',
            difficulty_level: 'easy',
            rule_set: 'normal',
            current_turn: 'B',
            status: 'FINISHED',
            result: 'WIN',
            duration_seconds: 95,
            created_at: '2026-04-04T10:00:00.000Z'
          }
        ])
      ),
      http.get(`*/games/${HISTORY_TEST_DATA.gameIdA}/moves`, () => HttpResponse.json([]))
    );

    renderHistoryPage();

    const openButton = await screen.findByRole('button', { name: /open ai game/i });
    await userEvent.click(openButton);
    expect(await screen.findByText('Game details')).toBeInTheDocument();
  });

  test('shows empty state when history has no games', async () => {
    server.use(http.get('*/users/:id/history', () => HttpResponse.json([])));

    renderHistoryPage();

    expect(await screen.findByText(/no games yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create new game/i })).toBeInTheDocument();
  });

  test('shows error when history endpoint fails', async () => {
    server.use(
      http.get('*/users/:id/history', () =>
        HttpResponse.json({ error: 'Server error' }, { status: 500 })
      )
    );

    renderHistoryPage();

    expect(await screen.findByText(/server error/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
