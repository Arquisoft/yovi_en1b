import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { EntryPage } from './pages/EntryPage';
import { HomePage } from './pages/HomePage';
import { NewGamePage } from './pages/NewGamePage';
import { GamePage } from './pages/GamePage';
import { GameHistoryPage } from './pages/GameHistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { useAuth } from './hooks/useAuth';
import './App.css';

function RootPage() {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? <HomePage /> : <EntryPage />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<RootPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/games/new" element={<NewGamePage />} />
              <Route path="/games/:id" element={<GamePage />} />
              <Route path="/games/history" element={<GameHistoryPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
