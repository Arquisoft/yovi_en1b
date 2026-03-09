import { createContext } from 'react';
import type { AuthState, LoginPayload, RegisterPayload } from '../types/auth';

export type AuthContextValue = AuthState & {
  loading: boolean;
  error: string | null;
  isLoggedIn: boolean;
  signIn: (payload: LoginPayload) => Promise<void>;
  signUp: (payload: RegisterPayload) => Promise<void>;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

