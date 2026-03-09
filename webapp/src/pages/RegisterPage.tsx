import { Navigate, useNavigate } from 'react-router-dom';
import RegisterForm from '../components/RegisterForm';
import { useAuth } from '../hooks/useAuth';

export default function RegisterPage() {
  const { isLoggedIn, loading, error, signUp } = useAuth();
  const navigate = useNavigate();

  if (isLoggedIn) {
    return <Navigate to="/games/new" replace />;
  }

  const handleRegister = async (payload: { username: string; password: string }) => {
    await signUp(payload);
    navigate('/games/new', { replace: true });
  };

  return (
    <div>
      <h1>Registrace</h1>
      <RegisterForm loading={loading} error={error} onSubmit={handleRegister} />
    </div>
  );
}
