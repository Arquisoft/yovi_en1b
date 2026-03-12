import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './TopBar.css';

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/games/new': 'New Game',
  '/games/history': 'Game History',
  '/profile': 'Profile'
};

function getPageTitle(pathname: string): string {
  if (TITLES[pathname]) {
    return TITLES[pathname];
  }

  if (pathname.startsWith('/games/')) {
    return 'Game';
  }

  return 'Game Y';
}

export function TopBar() {
  const location = useLocation();
  const { isLoggedIn, username, signOut } = useAuth();

  if (!isLoggedIn) {
    return null;
  }

  return (
    <header className="topbar">
      <Link to="/" className="topbar-brand" aria-label="Game Y home">
        <img src="/vite.svg" alt="Game Y logo" className="topbar-logo" />
        <span>Game Y</span>
      </Link>

      <p className="topbar-title">{getPageTitle(location.pathname)}</p>

      <div className="topbar-actions">
        <Link to="/profile" className="topbar-profile-link">
          {username}
        </Link>
        <button type="button" onClick={signOut} className="topbar-signout">
          Sign out
        </button>
      </div>
    </header>
  );
}

