import './AuthPage.css';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoginForm from '../components/LoginForm';
import { useAuth } from '../hooks/useAuth';
import type { LoginPayload } from '../types/auth';

type LoginLocationState = { from?: string };

export default function LoginPage() {
  const { isLoggedIn, loading, error, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const from = (location.state as LoginLocationState | null)?.from ?? '/games/new';

  if (isLoggedIn) return <Navigate to={from} replace />;

  const handleSubmit = async (payload: LoginPayload) => {
    await signIn(payload);
    navigate(from, { replace: true });
  };

  return (
    <div className="auth-page">
      <div className="auth-page-card">
        <h1>Přihlášení</h1>
        <LoginForm loading={loading} error={error} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
