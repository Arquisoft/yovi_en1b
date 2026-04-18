import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';

describe('HomePage', () => {
  test('shows the current home actions', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /create new game/i })).toHaveAttribute('href', '/games/new');
    expect(screen.getByRole('link', { name: /game history/i })).toHaveAttribute('href', '/games/history');
    expect(screen.getByRole('link', { name: /statistics \/ profile/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: /leaderboard/i })).toHaveAttribute('href', '/leaderboard');
    expect(screen.queryByRole('link', { name: /view statistics/i })).not.toBeInTheDocument();
  });
});
