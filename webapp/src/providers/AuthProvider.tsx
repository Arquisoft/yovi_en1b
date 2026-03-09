import { useMemo, useState } from 'react';
import { clearSession, login, readSession, register, saveSession } from '../api/authApi';
import { AuthContext } from '../contexts/authContext';
import type { AuthState, LoginPayload, RegisterPayload } from '../types/auth';
import type { AuthContextValue } from '../contexts/authContext';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(readSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (payload: LoginPayload) => {
    setLoading(true);
    setError(null);

    try {
      const session = await login(payload);
      saveSession(session);
      setState(readSession());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (payload: RegisterPayload) => {
    setLoading(true);
    setError(null);

    try {
      await register(payload);
      const session = await login(payload);
      saveSession(session);
      setState(readSession());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    clearSession();
    setState(readSession());
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      loading,
      error,
      isLoggedIn: Boolean(state.token),
      signIn,
      signUp,
      signOut
    }),
    [state, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
