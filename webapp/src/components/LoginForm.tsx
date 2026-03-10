import './AuthForm.css';
import { useState } from 'react';
import type { LoginPayload } from '../types/auth';

type LoginFormProps = {
  loading: boolean;
  error: string | null;
  onSubmit: (payload: LoginPayload) => Promise<void>;
};

export default function LoginForm({ loading, error, onSubmit }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({ username: username.trim(), password });
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          className="form-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          className="form-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="submit-button" disabled={loading}>
        {loading ? 'Přihlašuji...' : 'Přihlásit se'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
