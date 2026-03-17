import { Link } from 'react-router-dom';
import logo from '../assets/logo.svg';
import './HomePage.css';

export function HomePage() {
  return (
    <section className="home-card">
      <header className="home-hero">
        <div className="home-logo-glow" aria-hidden="true" />
        <img src={logo} alt="YOVI logo" className="home-logo" />
        <h1>Welcome to YOVI</h1>
        <p>Ready to play? Create a new game or check your history.</p>
      </header>

      <div className="home-actions-shell">
        <div className="home-actions">
          <Link to="/games/new" className="home-action">
            <span className="action-icon">+</span>
            <span>Create New Game</span>
          </Link>
          <Link to="/games/history" className="home-action">
            <span className="action-icon">📊</span>
            <span>Game History</span>
          </Link>
          <Link to="/profile" className="home-action">
            <span className="action-icon">👤</span>
            <span>View Statistics</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
