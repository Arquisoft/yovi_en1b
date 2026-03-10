import './TopBar.css';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Homepage',
  '/games/new': 'Tvorba hry',
  '/register': 'Registrace',
  '/login': 'Přihlášení',
};

function getTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/games/')) return 'Hra';
  if (pathname.includes('/history')) return 'Historie her';
  if (pathname.startsWith('/users/')) return 'Profil';
  return '';
}

export default function TopBar() {
  const { isLoggedIn, userId, username, signOut } = useAuth();
  const location = useLocation();

  if (!isLoggedIn) return null;

  const profileId = userId ?? '';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/" className="topbar-brand">
          <img src="/vite.svg" alt="logo" className="topbar-logo" />
          <span className="topbar-name">YOVI</span>
        </Link>
      </div>

      <div className="topbar-center">
        {getTitle(location.pathname)}
      </div>

      <div className="topbar-right">
        <Link to={`/users/${profileId}`} className="topbar-user" title="Profil">
          <span className="topbar-user-icon">👤</span>
          <span className="topbar-username">{username}</span>
        </Link>
        <button type="button" className="topbar-logout" onClick={signOut}>
          Odhlásit se
        </button>
      </div>
    </header>
  );
}

