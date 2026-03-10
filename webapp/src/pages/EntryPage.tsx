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
    if (!name) { setError('Zadejte uživatelské jméno.'); return; }

    setLoading(true);
    setError(null);
    try {
      const { exists } = await verifyUsername(name);
      setStep(exists ? 'login' : 'register');
    } catch {
      setError('Nepodařilo se ověřit jméno. Zkuste to znovu.');
    } finally {
      setLoading(false);
    }
  };

  /* ── step 2a: login ── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) { setError('Zadejte heslo.'); return; }

    setLoading(true);
    setError(null);
    try {
      await signIn({ username: username.trim(), password });
      navigate('/games/new', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Přihlášení selhalo.');
    } finally {
      setLoading(false);
    }
  };

  /* ── step 2b: register ── */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password)              { setError('Zadejte heslo.'); return; }
    if (password !== confirm)   { setError('Hesla se neshodují.'); return; }

    setLoading(true);
    setError(null);
    try {
      await signUp({ username: username.trim(), password });
      navigate('/games/new', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrace selhala.');
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
            <p className="entry-subtitle">Zadejte své uživatelské jméno pro vstup do aplikace.</p>
            <form onSubmit={handleVerify} className="entry-form">
              <input
                type="text"
                className="entry-input"
                placeholder="Uživatelské jméno"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
              <button type="submit" className="entry-button" disabled={loading}>
                {loading ? 'Ověřuji…' : 'Pokračovat'}
              </button>
              {error && <p className="entry-error">{error}</p>}
            </form>
          </>
        )}

        {/* ── login ── */}
        {step === 'login' && (
          <>
            <p className="entry-subtitle">
              Vítejte zpět, <strong>{username}</strong>. Zadejte heslo.
            </p>
            <form onSubmit={handleLogin} className="entry-form">
              <input
                type="password"
                className="entry-input"
                placeholder="Heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
              <button type="submit" className="entry-button" disabled={loading}>
                {loading ? 'Přihlašuji…' : 'Přihlásit se'}
              </button>
              {error && <p className="entry-error">{error}</p>}
              <button type="button" className="entry-back" onClick={goBack}>
                ← Zpět
              </button>
            </form>
          </>
        )}

        {/* ── register ── */}
        {step === 'register' && (
          <>
            <p className="entry-subtitle">
              Jméno <strong>{username}</strong> je volné. Zvolte heslo a zaregistrujte se.
            </p>
            <form onSubmit={handleRegister} className="entry-form">
              <input
                type="password"
                className="entry-input"
                placeholder="Heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="new-password"
              />
              <input
                type="password"
                className="entry-input"
                placeholder="Potvrzení hesla"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
              <button type="submit" className="entry-button" disabled={loading}>
                {loading ? 'Registruji…' : 'Registrovat se'}
              </button>
              {error && <p className="entry-error">{error}</p>}
              <button type="button" className="entry-back" onClick={goBack}>
                ← Zpět
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
