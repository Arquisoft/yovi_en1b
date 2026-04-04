import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, test } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../pages/HomePage';

describe('HomePage', () => {
  test('shows leaderboard action and hides old statistics action', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /leaderboard/i })).toHaveAttribute('href', '/leaderboard');
    expect(screen.queryByRole('link', { name: /view statistics/i })).not.toBeInTheDocument();
  });
});

