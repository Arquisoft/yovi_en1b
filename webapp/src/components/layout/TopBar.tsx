import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import logo from '../../assets/logo.svg';
import './TopBar.css';

export function TopBar() {
  const { isLoggedIn, username, signOut } = useAuth();

  if (!isLoggedIn) {
    return null;
  }

  return (
    <header className="topbar">
      <Link to="/" className="topbar-brand" aria-label="YOVI home">
        <img src={logo} alt="YOVI logo" className="topbar-logo" />
        <span className="topbar-text">YOVI</span>
      </Link>

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
