import './AuthForm.css';
import { useState } from 'react';
import type { RegisterPayload } from '../types/auth';

type RegisterFormProps = {
  loading: boolean;
  error: string | null;
  onSubmit: (payload: RegisterPayload) => Promise<void>;
};

export default function RegisterForm({ loading, error, onSubmit }: RegisterFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (!username.trim()) {
      setLocalError('Zadejte uživatelské jméno.');
      return;
    }

    if (!password.trim()) {
      setLocalError('Zadejte heslo.');
      return;
    }

    await onSubmit({ username: username.trim(), password });
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="register-username">Uživatelské jméno</label>
        <input
          type="text"
          id="register-username"
          className="form-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="register-password">Heslo</label>
        <input
          type="password"
          id="register-password"
          className="form-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button type="submit" className="submit-button" disabled={loading}>
        {loading ? 'Registruji...' : 'Registrovat se'}
      </button>

      {localError ? <p className="form-error">{localError}</p> : null}
      {error    ? <p className="form-error">{error}</p>      : null}
    </form>
  );
}
