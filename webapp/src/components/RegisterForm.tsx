import React, { useState } from 'react';
import type { RegisterPayload } from '../types/auth';

type RegisterFormProps = {
  loading: boolean;
  error: string | null;
  onSubmit: (payload: RegisterPayload) => Promise<void>;
};

const RegisterForm: React.FC<RegisterFormProps> = ({ loading, error, onSubmit }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLocalError(null);

    if (!username.trim()) {
      setLocalError('Please enter a username.');
      return;
    }

    if (!password.trim()) {
      setLocalError('Please enter a password.');
      return;
    }

    await onSubmit({ username: username.trim(), password });
  };

  return (
    <form onSubmit={handleSubmit} className="register-form">
      <div className="form-group">
        <label htmlFor="register-username">Username</label>
        <input
          type="text"
          id="register-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="form-input"
        />
      </div>

      <div className="form-group">
        <label htmlFor="register-password">Password</label>
        <input
          type="password"
          id="register-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="form-input"
        />
      </div>

      <button type="submit" className="submit-button" disabled={loading}>
        {loading ? 'Registering...' : 'Register'}
      </button>

      {localError ? <div className="error-message" style={{ marginTop: 12, color: 'red' }}>{localError}</div> : null}
      {error ? <div className="error-message" style={{ marginTop: 12, color: 'red' }}>{error}</div> : null}
    </form>
  );
};

export default RegisterForm;
