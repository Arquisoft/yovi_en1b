import { useMemo, useState } from 'react';
import { clearSession, login, readSession, register, saveSession } from '../../api/authApi';
import { AuthContext } from './authContext';
import type { AuthContextValue } from './authContext';
import type { LoginPayload, RegisterPayload } from '../../types/auth';

interface AuthProviderProps {
  readonly children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState(readSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (payload: LoginPayload) => {
    setLoading(true);
    setError(null);

    try {
      const nextSession = await login(payload);
      saveSession(nextSession);
      setSession(readSession());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
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
      const nextSession = await login(payload);
      saveSession(nextSession);
      setSession(readSession());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    clearSession();
    setSession(readSession());
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      ...session,
      isLoggedIn: Boolean(session.token),
      loading,
      error,
      signIn,
      signUp,
      signOut
    }),
    [session, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
