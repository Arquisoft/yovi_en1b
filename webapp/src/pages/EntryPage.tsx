import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkUsernameExists } from '../api/authApi';
import { useAuth } from '../hooks/useAuth';
import { Panel } from '../components/ui/Panel';
import './EntryPage.css';

export function EntryPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [usernameExists, setUsernameExists] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'username' | 'password'>('username');
  const confirmPasswordInputRef = useRef<HTMLInputElement | null>(null);

  const checkUsername = async () => {
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await checkUsernameExists(username);
      setUsernameExists(result.exists);
      setStage('password');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check username');
    } finally {
      setLoading(false);
    }
  };

  const handleUsernameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void checkUsername();
    }
  };

  const handlePasswordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !password) {
      return;
    }

    e.preventDefault();

    if (!usernameExists) {
      if (!confirmPassword) {
        confirmPasswordInputRef.current?.focus();
        return;
      }
    }

    handleSubmit(new Event('submit') as unknown as React.FormEvent);
  };

  const handleConfirmPasswordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && password && confirmPassword) {
      e.preventDefault();
      handleSubmit(new Event('submit') as unknown as React.FormEvent);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (stage === 'username') {
      await checkUsername();
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (usernameExists) {
        await auth.signIn({ username, password });
      } else {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        await auth.signUp({ username, password });
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setUsernameExists(null);
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setStage('username');
  };

  return (
    <Panel title="Welcome to YOVI" subtitle="Sign in or create an account">
      <form onSubmit={handleSubmit} className="entry-form">
        {stage === 'username' ? (
          <>
            <label>
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleUsernameKeyDown}
                disabled={loading}
                placeholder="Enter your username"
                autoFocus
              />
            </label>

            <button type="button" onClick={checkUsername} disabled={loading || !username.trim()}>
              {loading ? 'Checking...' : 'Continue'}
            </button>

            <p className="entry-hint">Press Enter or click Continue to proceed</p>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>{usernameExists ? 'Sign In' : 'Create Account'}</h3>
              <span style={{ fontSize: '0.9rem', color: '#64748b' }}>{username}</span>
            </div>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handlePasswordKeyDown}
                disabled={loading}
                placeholder="Enter your password"
                autoFocus
              />
            </label>

            {!usernameExists && (
              <label>
                Confirm Password
                <input
                  ref={confirmPasswordInputRef}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={handleConfirmPasswordKeyDown}
                  disabled={loading}
                  placeholder="Confirm your password"
                />
              </label>
            )}

            <div className="entry-actions">
              <button
                type="submit"
                disabled={loading || !password || (!usernameExists && password !== confirmPassword)}
              >
                {loading ? 'Processing...' : usernameExists ? 'Sign In' : 'Create Account'}
              </button>
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
              >
                Back
              </button>
            </div>

            <p className="entry-hint">Press Enter in the last field to submit, or click the button</p>
          </>
        )}

        {error ? <p className="entry-error">⚠️ {error}</p> : null}
      </form>
    </Panel>
  );
}
