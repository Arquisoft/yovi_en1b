import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { LeaderboardPage } from '../pages/LeaderboardPage';

describe('LeaderboardPage', () => {
  test('renders leaderboard with overall and bot tabs', async () => {
    server.use(
      http.get('*/leaderboard', () =>
        HttpResponse.json({
          overall: [
            { username: 'player1', total_wins: 10, total_games: 15 },
            { username: 'player2', total_wins: 8, total_games: 12 }
          ],
          vs_bots: {
            random: [
              { username: 'player1', wins: 5 },
              { username: 'player2', wins: 3 }
            ],
            ai: [
              { username: 'player1', wins: 3 },
              { username: 'player2', wins: 2 }
            ],
            dijkstra: [
              { username: 'player1', wins: 2 },
              { username: 'player2', wins: 3 }
            ]
          }
        })
      )
    );

    render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>
    );

    // Check loading state appears
    expect(screen.getByText(/loading leaderboard/i)).toBeInTheDocument();

    // Check overall leaderboard loads
    expect(await screen.findByText('player1')).toBeInTheDocument();
    expect(screen.getByText('player2')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Overall')).toBeInTheDocument();

    // Check bot tabs are present
    expect(screen.getByText(/vs Random/i)).toBeInTheDocument();
    expect(screen.getByText(/vs AI/i)).toBeInTheDocument();
    expect(screen.getByText(/vs Dijkstra/i)).toBeInTheDocument();
  });

  test('shows empty state when no games played', async () => {
    server.use(
      http.get('*/leaderboard', () =>
        HttpResponse.json({
          overall: [],
          vs_bots: {
            random: [],
            ai: [],
            dijkstra: []
          }
        })
      )
    );

    render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/no games played yet/i)).toBeInTheDocument();
  });

  test('shows error message on API failure', async () => {
    server.use(
      http.get('*/leaderboard', () =>
        HttpResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 })
      )
    );

    render(
      <MemoryRouter>
        <LeaderboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/failed to load leaderboard/i)).toBeInTheDocument();
  });
});

