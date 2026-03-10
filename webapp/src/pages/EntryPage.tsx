import './EntryPage.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyUsername } from '../api/authApi';
import { useAuth } from '../hooks/useAuth';

type Step = 'username' | 'login' | 'register';

export default function EntryPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [step, setStep]           = useState<Step>('username');
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  /* ── step 1: verify username ── */
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) { setError('Please enter a username.'); return; }

    setLoading(true);
    setError(null);
    try {
      const { exists } = await verifyUsername(name);
      setStep(exists ? 'login' : 'register');
    } catch {
      setError('Could not verify username. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* ── step 2a: login ── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError('Please enter a password.'); return; }

    setLoading(true);
    setError(null);
    try {
      await signIn({ username: username.trim(), password });
      navigate('/games/new', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  /* ── step 2b: register ── */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password)              { setError('Please enter a password.'); return; }
    if (password !== confirm)   { setError('Passwords do not match.'); return; }

    setLoading(true);
    setError(null);
    try {
      await signUp({ username: username.trim(), password });
      navigate('/games/new', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setStep('username');
    setPassword('');
    setConfirm('');
    setError(null);
  };

  return (
    <div className="entry-page">
      <div className="entry-card">
        <h1 className="entry-title">YOVI</h1>

        {/* ── username ── */}
        {step === 'username' && (
          <>
            <p className="entry-subtitle">Enter your username to access the app.</p>
            <form onSubmit={handleVerify} className="entry-form">
              <input
                type="text"
                className="entry-input"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
              <button type="submit" className="entry-button" disabled={loading}>
                {loading ? 'Checking...' : 'Continue'}
              </button>
              {error && <p className="entry-error">{error}</p>}
            </form>
          </>
        )}

        {/* ── login ── */}
        {step === 'login' && (
          <>
            <p className="entry-subtitle">
              Welcome back, <strong>{username}</strong>. Enter your password.
            </p>
            <form onSubmit={handleLogin} className="entry-form">
              <input
                type="password"
                className="entry-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
              <button type="submit" className="entry-button" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
              {error && <p className="entry-error">{error}</p>}
              <button type="button" className="entry-back" onClick={goBack}>
                {'<- Back'}
              </button>
            </form>
          </>
        )}

        {/* ── register ── */}
        {step === 'register' && (
          <>
            <p className="entry-subtitle">
              Username <strong>{username}</strong> is available. Choose a password to register.
            </p>
            <form onSubmit={handleRegister} className="entry-form">
              <input
                type="password"
                className="entry-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="new-password"
              />
              <input
                type="password"
                className="entry-input"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
              <button type="submit" className="entry-button" disabled={loading}>
                {loading ? 'Creating account...' : 'Register'}
              </button>
              {error && <p className="entry-error">{error}</p>}
              <button type="button" className="entry-back" onClick={goBack}>
                {'<- Back'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
