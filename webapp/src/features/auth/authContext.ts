import { createContext } from 'react';
import type { LoginPayload, RegisterPayload } from '../../types/auth';

export type AuthContextValue = {
  token: string | null;
  username: string | null;
  userId: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;
  signIn: (payload: LoginPayload) => Promise<void>;
  signUp: (payload: RegisterPayload) => Promise<void>;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

