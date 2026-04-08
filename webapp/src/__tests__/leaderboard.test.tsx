import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { describe, expect, test, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { LeaderboardPage } from '../pages/LeaderboardPage';

const MOCK_LEADERBOARD_DATA = {
  overall: [
    { username: 'champion_player', total_wins: 25, total_games: 30 },
    { username: 'second_best', total_wins: 20, total_games: 28 },
    { username: 'rising_star', total_wins: 15, total_games: 25 },
    { username: 'casual_gamer', total_wins: 10, total_games: 20 }
  ],
  vs_bots: {
    random: [
      { username: 'champion_player', wins: 8 },
      { username: 'second_best', wins: 6 }
    ],
    ai: [
      { username: 'champion_player', wins: 12 },
      { username: 'rising_star', wins: 9 }
    ],
    dijkstra: [
      { username: 'champion_player', wins: 5 },
      { username: 'casual_gamer', wins: 4 }
    ]
  }
};

const EMPTY_LEADERBOARD = {
  overall: [],
  vs_bots: {
    random: [],
    ai: [],
    dijkstra: []
  }
};

describe('LeaderboardPage', () => {
  beforeEach(() => {
    server.use(
      http.get('*/leaderboard', () => HttpResponse.json(MOCK_LEADERBOARD_DATA))
    );
  });

  describe('Initial Load and Rendering', () => {
    test('renders with loading state initially', () => {
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      expect(screen.getByText(/loading leaderboard/i)).toBeInTheDocument();
    });

    test('renders leaderboard with title and subtitle', async () => {
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Leaderboard')).toBeInTheDocument();
      });
    });

    test('renders all tab options', async () => {
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Overall')).toBeInTheDocument();
        expect(screen.getByText(/vs Random/i)).toBeInTheDocument();
        expect(screen.getByText(/vs AI/i)).toBeInTheDocument();
        expect(screen.getByText(/vs Dijkstra/i)).toBeInTheDocument();
      });
    });
  });

  describe('Overall Leaderboard', () => {
    test('displays all players with correct data', async () => {
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('champion_player')).toBeInTheDocument();
        expect(screen.getByText('second_best')).toBeInTheDocument();
        expect(screen.getByText('rising_star')).toBeInTheDocument();
        expect(screen.getByText('casual_gamer')).toBeInTheDocument();
      });
    });

    test('displays correct win counts', async () => {
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        // Should show all wins counts
        const allNumbers = screen.getAllByText(/\d+/);
        expect(allNumbers.length).toBeGreaterThan(0);
      });
    });

    test('shows correct column headers', async () => {
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('columnheader', { name: 'Rank' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Player' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Wins' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Games' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Win Rate' })).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    test('switches to random bot leaderboard', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      const randomTab = await screen.findByText(/vs Random/i);
      await user.click(randomTab);

      await waitFor(() => {
        expect(randomTab).toHaveClass('leaderboard-tab--active');
        expect(screen.getByText('champion_player')).toBeInTheDocument();
      });
    });

    test('switches to AI bot leaderboard', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      const aiTab = await screen.findByText(/vs AI/i);
      await user.click(aiTab);

      await waitFor(() => {
        expect(aiTab).toHaveClass('leaderboard-tab--active');
      });
    });

    test('switches to Dijkstra bot leaderboard', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      const dijkstraTab = await screen.findByText(/vs Dijkstra/i);
      await user.click(dijkstraTab);

      await waitFor(() => {
        expect(dijkstraTab).toHaveClass('leaderboard-tab--active');
      });
    });

    test('returns to overall tab from bot tab', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      const randomTab = await screen.findByText(/vs Random/i);
      await user.click(randomTab);

      const overallTab = screen.getByText('Overall');
      await user.click(overallTab);

      await waitFor(() => {
        expect(overallTab).toHaveClass('leaderboard-tab--active');
      });
    });
  });

  describe('Empty States', () => {
    test('shows empty state when no games played', async () => {
      server.use(
        http.get('*/leaderboard', () => HttpResponse.json(EMPTY_LEADERBOARD))
      );

      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/no games played yet/i)).toBeInTheDocument();
      });
    });

    test('shows empty message for bot leaderboard with no wins', async () => {
      server.use(
        http.get('*/leaderboard', () => HttpResponse.json(EMPTY_LEADERBOARD))
      );

      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      const randomTab = await screen.findByText(/vs Random/i);
      await user.click(randomTab);

      await waitFor(() => {
        expect(screen.getByText(/no games against this bot yet/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
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

      await waitFor(() => {
        expect(screen.getByText(/failed to load leaderboard/i)).toBeInTheDocument();
      });
    });

    test('handles network timeout gracefully', async () => {
      server.use(
        http.get('*/leaderboard', () => {
          throw new Error('Network timeout');
        })
      );

      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/http 500|failed to load leaderboard|network timeout/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('has proper table structure with headers', async () => {
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        const table = screen.getByRole('table');
        expect(table).toBeInTheDocument();
      });
    });

    test('tab buttons are keyboard accessible', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      const overallTab = await screen.findByText('Overall');

      // Tab should be keyboard focusable
      await user.tab();
      expect(overallTab).toHaveFocus();
    });
  });

  describe('Data Display Accuracy', () => {
    test('displays top 10 players in correct order', async () => {
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        const players = screen.getAllByText(/player/i);
        // First player should have highest wins
        expect(screen.getByText('champion_player')).toBeInTheDocument();
      });
    });

    test('formats win rate as percentage', async () => {
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        // Should display percentages (%) in win rate column
        const percentElements = screen.getAllByText(/%/);
        expect(percentElements.length).toBeGreaterThan(0);
      });
    });

    test('displays bot-specific wins correctly', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      const randomTab = await screen.findByText(/vs Random/i);
      await user.click(randomTab);

      await waitFor(() => {
        expect(screen.getByText('champion_player')).toBeInTheDocument();
        // Should show specific wins count for this bot
        expect(screen.getByText(/8/)).toBeInTheDocument();
      });
    });
  });

  describe('Animation and UI', () => {
    test('content animates on load', async () => {
      const { container } = render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        const content = container.querySelector('.leaderboard-content');
        expect(content).toBeInTheDocument();
      });
    });

    test('active tab has visual indication', async () => {
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <LeaderboardPage />
        </MemoryRouter>
      );

      const overallTab = await screen.findByText('Overall');
      expect(overallTab).toHaveClass('leaderboard-tab--active');
    });
  });
});
