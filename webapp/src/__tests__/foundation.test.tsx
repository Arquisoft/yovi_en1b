import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, test } from 'vitest';
import { AuthProvider } from '../features/auth/AuthProvider';
import { useAuth } from '../hooks/useAuth';

function TestComponent() {
  const auth = useAuth();
  return <div>{auth.isLoggedIn ? 'Logged in' : 'Logged out'}</div>;
}

describe('Foundation - AuthProvider', () => {
  test('renders without crashing', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    expect(screen.getByText('Logged out')).toBeInTheDocument();
  });
});




