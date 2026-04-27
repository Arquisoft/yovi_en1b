import { faker } from '@faker-js/faker';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider';
import { NewGamePage } from '../pages/NewGamePage';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';

faker.seed(20260317);
const NEW_GAME_TEST_DATA = {
  authToken: faker.string.alphanumeric(24),
  username: faker.internet.username().toLowerCase(),
  userId: faker.string.alphanumeric(8),
  gameIdOne: faker.string.alphanumeric(10),
  gameIdTwo: faker.string.alphanumeric(10),
  opponentName: faker.person.firstName(),
} as const;

function setSession() {
  localStorage.setItem('auth_token', NEW_GAME_TEST_DATA.authToken);
  localStorage.setItem('auth_username', NEW_GAME_TEST_DATA.username);
  localStorage.setItem('auth_user_id', NEW_GAME_TEST_DATA.userId);
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
  test('shows page heading and Start Game button', async () => {
    renderNewGamePage();
    expect(screen.getByRole('heading', { name: /new game/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /start game/i })).toBeInTheDocument();
  });

  test('shows Opponent, Board Size, Bot Strategy and Variants sections', () => {
    renderNewGamePage();
    expect(screen.getByText('Opponent')).toBeInTheDocument();
    expect(screen.getByText('Board Size')).toBeInTheDocument();
    expect(screen.getByText('Bot Strategy')).toBeInTheDocument();
    expect(screen.getByText('Variants')).toBeInTheDocument();
  });

  test('shows only strategy-allowed variants for BOT games', async () => {
    renderNewGamePage();

    // Random is selected by default in mocks; Explosions allows only AI.
    expect(screen.queryByLabelText(/explosions/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/double turn/i)).not.toBeInTheDocument();

    await userEvent.click(await screen.findByLabelText(/ai/i));
    expect(await screen.findByLabelText(/explosions/i)).toBeInTheDocument();
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
    await userEvent.click(await screen.findByLabelText(/ai/i));
    await screen.findByLabelText(/explosions/i);
    await userEvent.click(screen.getByLabelText(/explosions/i));
    await userEvent.click(screen.getByRole('button', { name: /start game/i }));
    await screen.findByText(/internal server error/i);
  });
});

// ─── game creation ────────────────────────────────────────────────────────────

describe('NewGamePage — game creation', () => {
  test('successful BOT game creation submits selected variants', async () => {
    let receivedBody: any = null;

    server.use(
      http.post('*/games', async ({ request }) => {
        receivedBody = (await request.json()) as { variants?: string[] };
        return HttpResponse.json({
          _id: NEW_GAME_TEST_DATA.gameIdOne,
          player_id: NEW_GAME_TEST_DATA.userId,
          game_type: 'BOT',
          name_of_enemy: 'Defensive',
          board_size: 5,
          strategy: 'defensive',
          variants: receivedBody?.variants ?? [],
          difficulty_level: 'medium',
          rule_set: 'normal',
          current_turn: 'B',
          status: 'IN_PROGRESS',
          result: null,
          duration_seconds: 0,
          created_at: new Date().toISOString(),
          moves: []
        }, { status: 201 });
      })
    );

    renderNewGamePage();
    await userEvent.click(await screen.findByLabelText(/ai/i));
    await screen.findByLabelText(/explosions/i);
    await userEvent.click(screen.getByLabelText(/explosions/i));
    await userEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(receivedBody?.variants).toEqual(['Explosions']);
  });

  test('successful PLAYER game creation carries selected variants too', async () => {
    let receivedBody: any = null;

    server.use(
      http.post('*/games', async ({ request }) => {
        receivedBody = (await request.json()) as { variants?: string[]; name_of_enemy?: string };
        if (!receivedBody.name_of_enemy) {
          return HttpResponse.json({ error: 'name_of_enemy is required' }, { status: 400 });
        }
        return HttpResponse.json({
          _id: NEW_GAME_TEST_DATA.gameIdTwo, player_id: NEW_GAME_TEST_DATA.userId, game_type: 'PLAYER',
          name_of_enemy: receivedBody.name_of_enemy, board_size: 5,
          strategy: 'random', variants: receivedBody.variants ?? [], difficulty_level: 'medium', rule_set: 'normal',
          current_turn: 'B', status: 'IN_PROGRESS', result: null,
          duration_seconds: 0, created_at: new Date().toISOString(), moves: []
        }, { status: 201 });
      })
    );

    renderNewGamePage();
    await userEvent.click(screen.getByLabelText(/play vs player/i));
    await userEvent.type(screen.getByLabelText(/opponent name/i), NEW_GAME_TEST_DATA.opponentName);
    await userEvent.click(screen.getByLabelText(/explosions/i));
    await userEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(receivedBody?.variants).toEqual(['Explosions']);
  });
});
