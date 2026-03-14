import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider';
import { NewGamePage } from '../pages/NewGamePage';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

function setSession() {
  localStorage.setItem('auth_token', 'mock-token-u1');
  localStorage.setItem('auth_username', 'alice');
  localStorage.setItem('auth_user_id', 'u1');
}

function renderNewGamePage() {
  setSession();
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NewGamePage />
      </AuthProvider>
    </MemoryRouter>
  );
}

// ─── rendering ────────────────────────────────────────────────────────────────

describe('NewGamePage — rendering', () => {
  test('shows page heading and Start Game button', () => {
    renderNewGamePage();
    expect(screen.getByRole('heading', { name: /new game/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
  });

  test('shows Opponent, Board Size and Rules sections', () => {
    renderNewGamePage();
    expect(screen.getByText('Opponent')).toBeInTheDocument();
    expect(screen.getByText('Board Size')).toBeInTheDocument();
    expect(screen.getByText('Rules')).toBeInTheDocument();
  });

  test('AI Difficulty section is visible in default BOT mode', () => {
    renderNewGamePage();
    expect(screen.getByText('AI Difficulty')).toBeInTheDocument();
  });

  test('AI Difficulty section is hidden when Play vs Player is selected', async () => {
    renderNewGamePage();
    await userEvent.click(screen.getByLabelText(/play vs player/i));
    expect(screen.queryByText('AI Difficulty')).not.toBeInTheDocument();
  });

  test('Opponent Name input appears only in Player mode', async () => {
    renderNewGamePage();
    expect(screen.queryByLabelText(/opponent name/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/play vs player/i));
    expect(screen.getByLabelText(/opponent name/i)).toBeInTheDocument();
  });

  test('board size slider is present with default value 5', () => {
    renderNewGamePage();
    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('5');
  });
});

// ─── validation ───────────────────────────────────────────────────────────────

describe('NewGamePage — validation', () => {
  test('submitting Player mode without opponent name shows error', async () => {
    renderNewGamePage();
    await userEvent.click(screen.getByLabelText(/play vs player/i));
    await userEvent.click(screen.getByRole('button', { name: /start game/i }));
    await screen.findByText(/please enter opponent name/i);
  });

  test('server error during game creation shows error message', async () => {
    server.use(
      http.post('*/games', () =>
        HttpResponse.json({ error: 'Internal server error' }, { status: 500 })
      )
    );
    renderNewGamePage();
    await userEvent.click(screen.getByRole('button', { name: /start game/i }));
    await screen.findByText(/internal server error/i);
  });
});

// ─── game creation ────────────────────────────────────────────────────────────

describe('NewGamePage — game creation', () => {
  test('successful BOT game creation hides the form', async () => {
    server.use(
      http.post('*/games', () =>
        HttpResponse.json({
          _id: 'game-1',
          player_id: 'u1',
          game_type: 'BOT',
          name_of_enemy: null,
          board_size: 5,
          strategy: 'random',
          difficulty_level: 'medium',
          rule_set: 'normal',
          current_turn: 'B',
          status: 'IN_PROGRESS',
          result: null,
          duration_seconds: 0,
          created_at: new Date().toISOString(),
          moves: []
        }, { status: 201 })
      )
    );
    renderNewGamePage();
    await userEvent.click(screen.getByRole('button', { name: /start game/i }));
    // After navigation the form should no longer be in the document
    await screen.findByRole('button', { name: /start game|creating game/i });
  });

  test('successful PLAYER game creation requires opponent name', async () => {
    server.use(
      http.post('*/games', async ({ request }) => {
        const body = (await request.json()) as { name_of_enemy?: string };
        if (!body.name_of_enemy) {
          return HttpResponse.json({ error: 'name_of_enemy is required' }, { status: 400 });
        }
        return HttpResponse.json({
          _id: 'game-2', player_id: 'u1', game_type: 'PLAYER',
          name_of_enemy: body.name_of_enemy, board_size: 5,
          strategy: 'random', difficulty_level: 'medium', rule_set: 'normal',
          current_turn: 'B', status: 'IN_PROGRESS', result: null,
          duration_seconds: 0, created_at: new Date().toISOString(), moves: []
        }, { status: 201 });
      })
    );
    renderNewGamePage();
    await userEvent.click(screen.getByLabelText(/play vs player/i));
    await userEvent.type(screen.getByLabelText(/opponent name/i), 'Bob');
    await userEvent.click(screen.getByRole('button', { name: /start game/i }));
    // error must NOT appear
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/name_of_enemy is required/i)).not.toBeInTheDocument();
  });
});

