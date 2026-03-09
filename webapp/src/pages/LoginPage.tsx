import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import LoginForm from '../components/LoginForm';
import { useAuth } from '../hooks/useAuth';

type LoginLocationState = {
  from?: string;
};

export default function LoginPage() {
  const { isLoggedIn, loading, error, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const from = (location.state as LoginLocationState | null)?.from ?? '/games/new';

  if (isLoggedIn) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (payload: { username: string; password: string }) => {
    await signIn(payload);
    navigate(from, { replace: true });
  };

  return (
    <div>
      <h1>Login</h1>
      <p>Prihlaseni pres JWT token.</p>
      <LoginForm loading={loading} error={error} onSubmit={handleSubmit} />
    </div>
  );
}
