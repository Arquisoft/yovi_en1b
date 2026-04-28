import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute() {
  const { isLoggedIn } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) {
    // Preserve the target path so login can send the user back where they came from.
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

