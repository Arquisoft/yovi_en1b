import { useEffect, useState } from 'react';
import type { LoginPayload } from '../types/auth';

type LoginFormProps = {
  loading: boolean;
  error: string | null;
  onSubmit: (payload: LoginPayload) => Promise<void>;
  defaultUsername?: string;
};

export default function LoginForm({ loading, error, onSubmit, defaultUsername = '' }: LoginFormProps) {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');

  useEffect(() => {
    setUsername(defaultUsername);
  }, [defaultUsername]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({ username: username.trim(), password });
  };

  return (
    <form className="register-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="login-username">Username</label>
        <input
          id="login-username"
          className="form-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
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
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      <button type="submit" className="submit-button" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
    </form>
  );
}
