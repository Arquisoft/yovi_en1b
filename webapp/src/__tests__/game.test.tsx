import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../features/auth/AuthProvider';
import { GamePage } from '../pages/GamePage';
import { server } from '../mocks/server';
import { http, HttpResponse } from 'msw';
import type { GameRecord } from '../types/games';

// ─── helpers ──────────────────────────────────────────────────────────────────

const BASE_GAME: GameRecord = {
  _id: 'game-1',
  player_id: 'u1',
  game_type: 'PLAYER',
  name_of_enemy: 'Bob',
  board_size: 3,
  strategy: 'random',
  difficulty_level: 'medium',
  rule_set: 'normal',
  current_turn: 'B',
  status: 'IN_PROGRESS',
  result: null,
  duration_seconds: 0,
  created_at: new Date().toISOString(),
  moves: []
};

function setSession() {
  localStorage.setItem('auth_token', 'mock-token-u1');
  localStorage.setItem('auth_username', 'alice');
  localStorage.setItem('auth_user_id', 'u1');
}

function renderGamePage(gameId = 'game-1') {
  setSession();
  return render(
    <MemoryRouter initialEntries={[`/games/${gameId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/games/:id" element={<GamePage />} />
          <Route path="/games/new" element={<div>New Game Page</div>} />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

// ─── loading ──────────────────────────────────────────────────────────────────

describe('GamePage — loading', () => {
  test('shows loading indicator initially', () => {
    server.use(http.get('*/games/game-1', () => HttpResponse.json(BASE_GAME)));
    renderGamePage();
    expect(screen.getByText(/loading game/i)).toBeInTheDocument();
  });

  test('renders game board after loading', async () => {
    server.use(http.get('*/games/game-1', () => HttpResponse.json(BASE_GAME)));
    renderGamePage();
    await screen.findByLabelText('game board');
    expect(screen.getByLabelText('game board')).toBeInTheDocument();
  });

  test('shows both player panels', async () => {
    server.use(http.get('*/games/game-1', () => HttpResponse.json(BASE_GAME)));
    renderGamePage();
    await screen.findByLabelText('game board');
    expect(screen.getByText(/you \(blue\)/i)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  test('shows error message when game is not found', async () => {
    server.use(
      http.get('*/games/game-1', () =>
        HttpResponse.json({ error: 'Game not found' }, { status: 404 })
      )
    );
    renderGamePage();
    await screen.findByText(/game not found/i);
  });

  test('board has correct number of hexes for board_size 3 (6 hexes total)', async () => {
    server.use(http.get('*/games/game-1', () => HttpResponse.json(BASE_GAME)));
    renderGamePage();
    const board = await screen.findByLabelText('game board');
    // triangle: 1+2+3 = 6 hex wrappers
    const hexes = within(board).getAllByRole('button');
    expect(hexes).toHaveLength(6);
  });
});

// ─── move ─────────────────────────────────────────────────────────────────────

describe('GamePage — move', () => {
  beforeEach(() => {
    server.use(http.get('*/games/game-1', () => HttpResponse.json(BASE_GAME)));
  });

  test('clicking a hex adds a move to history', async () => {
    server.use(
      http.post('*/games/game-1/move', async ({ request }) => {
        const body = (await request.json()) as { coordinates: { x: number; y: number; z: number } };
        return HttpResponse.json({
          ...BASE_GAME,
          current_turn: 'R',
          moves: [{
            move_number: 1,
            player: 'B',
            coordinates: body.coordinates,
            created_at: new Date().toISOString()
          }]
        }, { status: 201 });
      })
    );
    renderGamePage();
    const board = await screen.findByLabelText('game board');
    const firstHex = within(board).getAllByRole('button')[0];
    await userEvent.click(firstHex);
    await screen.findByText(/move #1/i);
  });

  test("in PLAYER mode on Red turn, occupied hexes are disabled but free hexes stay enabled", async () => {
    const redTurnGame: GameRecord = {
      ...BASE_GAME,
      current_turn: 'R',
      moves: [{
        move_number: 1,
        player: 'B',
        coordinates: { x: 0, y: 0, z: 2 },
        created_at: new Date().toISOString()
      }]
    };
    server.use(http.get('*/games/game-1', () => HttpResponse.json(redTurnGame)));
    renderGamePage();

    const board = await screen.findByLabelText('game board');
    const hexes = within(board).getAllByRole('button');

    // One occupied cell from the existing move is disabled.
    const disabledHexes = hexes.filter((hex) => hex.getAttribute('aria-disabled') === 'true');
    expect(disabledHexes.length).toBeGreaterThanOrEqual(1);

    // Local PLAYER mode keeps free cells playable on both turns.
    const enabledHexes = hexes.filter((hex) => hex.getAttribute('aria-disabled') === 'false');
    expect(enabledHexes.length).toBeGreaterThanOrEqual(1);
  });

  test('move on occupied hex is not sent to server', async () => {
    let moveCalled = false;
    server.use(
      http.post('*/games/game-1/move', () => {
        moveCalled = true;
        return HttpResponse.json({}, { status: 400 });
      })
    );
    const gameWithMove: GameRecord = {
      ...BASE_GAME,
      moves: [{
        move_number: 1,
        player: 'B',
        coordinates: { x: 0, y: 0, z: 2 },
        created_at: new Date().toISOString()
      }]
    };
    server.use(http.get('*/games/game-1', () => HttpResponse.json(gameWithMove)));
    renderGamePage();
    const board = await screen.findByLabelText('game board');
    // First hex is occupied by Blue — it must be aria-disabled
    const occupiedHex = within(board).getAllByRole('button')[0];
    expect(occupiedHex).toHaveAttribute('aria-disabled', 'true');
    expect(moveCalled).toBe(false);
  });
});

// ─── undo ─────────────────────────────────────────────────────────────────────

describe('GamePage — undo', () => {
  test('undo button is disabled when there are no moves', async () => {
    server.use(http.get('*/games/game-1', () => HttpResponse.json(BASE_GAME)));
    renderGamePage();
    await screen.findByLabelText('game board');
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
  });

  test('undo removes last move from history', async () => {
    const gameWithMove: GameRecord = {
      ...BASE_GAME,
      current_turn: 'R',
      moves: [{
        move_number: 1,
        player: 'B',
        coordinates: { x: 0, y: 0, z: 2 },
        created_at: new Date().toISOString()
      }]
    };
    server.use(
      http.get('*/games/game-1', () => HttpResponse.json(gameWithMove)),
      http.post('*/games/game-1/undo', () =>
        HttpResponse.json({ ...BASE_GAME, moves: [] })
      )
    );
    renderGamePage();
    await screen.findByText(/move #1/i);
    await userEvent.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(() => {
      expect(screen.queryByText(/move #1/i)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/no moves yet/i)).toBeInTheDocument();
  });
});

// ─── finish ───────────────────────────────────────────────────────────────────

describe('GamePage — finish', () => {
  test('finish button sends DRAW result and shows it in UI', async () => {
    server.use(
      http.get('*/games/game-1', () => HttpResponse.json(BASE_GAME)),
      http.put('*/games/game-1/finish', () =>
        HttpResponse.json({ ...BASE_GAME, status: 'FINISHED', result: 'DRAW' })
      )
    );
    renderGamePage();
    await screen.findByLabelText('game board');
    await userEvent.click(screen.getByRole('button', { name: /finish/i }));
    await screen.findByText(/draw/i);
  });

  test('finish button is disabled after game is already finished', async () => {
    const finishedGame: GameRecord = {
      ...BASE_GAME,
      status: 'FINISHED',
      result: 'WIN',
      moves: [{
        move_number: 1, player: 'B',
        coordinates: { x: 0, y: 0, z: 2 },
        created_at: new Date().toISOString()
      }]
    };
    server.use(http.get('*/games/game-1', () => HttpResponse.json(finishedGame)));
    renderGamePage();
    await screen.findByLabelText('game board');
    expect(screen.getByRole('button', { name: /finish/i })).toBeDisabled();
  });
});

