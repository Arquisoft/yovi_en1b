import './App.css';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import UserDetailPage from './pages/UserDetailPage';
import NewGamePage from './pages/NewGamePage';
import GamePage from './pages/GamePage';
import GameHistoryPage from './pages/GameHistoryPage';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './hooks/useAuth';

function App() {
  const { isLoggedIn, userId, signOut } = useAuth();
  const profileId = userId ?? 'demo';

  return (
    <div>
      <nav style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
        <Link to="/">homepage</Link>
        {!isLoggedIn ? <Link to="/login">login</Link> : null}
        {!isLoggedIn ? <Link to="/register">registrace</Link> : null}
        {isLoggedIn ? <Link to={`/users/${profileId}`}>detail uzivatele</Link> : null}
        {isLoggedIn ? <Link to={`/users/${profileId}/history`}>game history</Link> : null}
        {isLoggedIn ? <Link to="/games/new">tvorba hry</Link> : null}
        {isLoggedIn ? <button type="button" onClick={signOut}>logout</button> : null}
      </nav>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/users/:id" element={<UserDetailPage />} />
          <Route path="/users/:id/history" element={<GameHistoryPage />} />
          <Route path="/games/new" element={<NewGamePage />} />
          <Route path="/games/:id" element={<GamePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
