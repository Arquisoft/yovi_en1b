import { useContext } from 'react';
import { AuthContext } from '../contexts/authContext';

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return auth;
}
