import './App.css';
import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import UserDetailPage from './pages/UserDetailPage';
import NewGamePage from './pages/NewGamePage';
import GamePage from './pages/GamePage';
import GameHistoryPage from './pages/GameHistoryPage';
import ProtectedRoute from './components/ProtectedRoute';
import TopBar from './components/TopBar';

function App() {
  return (
    <div className="app-shell">
      <TopBar />

      <main className="app-content">
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
      </main>
    </div>
  );
}

export default App;
