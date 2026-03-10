import './App.css';
import { Navigate, Route, Routes } from 'react-router-dom';
import EntryPage from './pages/EntryPage';
import HomePage from './pages/HomePage';
import UserDetailPage from './pages/UserDetailPage';
import NewGamePage from './pages/NewGamePage';
import GamePage from './pages/GamePage';
import GameHistoryPage from './pages/GameHistoryPage';
import ProtectedRoute from './components/ProtectedRoute';
import TopBar from './components/TopBar';
import { useAuth } from './hooks/useAuth';

function App() {
  const { isLoggedIn, userId } = useAuth();
  const profileId = userId ?? 'demo';

  return (
    <div className="app-shell">
      <TopBar />

      <main className="app-content">
        <Routes>
          <Route path="/" element={isLoggedIn ? <HomePage userId={profileId} /> : <EntryPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={<HomePage userId={profileId} />} />
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route path="/users/:id/history" element={<GameHistoryPage />} />
            <Route path="/games/new" element={<NewGamePage />} />
            <Route path="/games/:id" element={<GamePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
