import { Link } from 'react-router-dom';
import logo from '../assets/logo.svg';
import './HomePage.css';

export function HomePage() {
  return (
    <section className="home-card">
      <div className="home-background-orb home-background-orb--one" aria-hidden="true" />
      <div className="home-background-orb home-background-orb--two" aria-hidden="true" />

      <header className="home-hero">
        <div className="home-logo-frame">
          <img src={logo} alt="YOVI logo" className="home-logo" />
        </div>

        <div className="home-hero-copy">
          <h1>Welcome to YOVI</h1>
          <p>Pick a game, review your progress, and keep climbing.</p>
        </div>
      </header>

      <section className="home-actions" aria-label="Quick actions">
        <Link to="/games/new" className="home-action home-action--primary">
          <span className="home-action-icon" aria-hidden="true">➕</span>
          <span className="home-action-label">Create New Game</span>
        </Link>
        <Link to="/games/history" className="home-action">
          <span className="home-action-icon" aria-hidden="true">🕘</span>
          <span className="home-action-label">Game History</span>
        </Link>
        <Link to="/profile" className="home-action">
          <span className="home-action-icon" aria-hidden="true">👤</span>
          <span className="home-action-label">Statistics / Profile</span>
        </Link>
        <Link to="/leaderboard" className="home-action">
          <span className="home-action-icon" aria-hidden="true">🏆</span>
          <span className="home-action-label">Leaderboard</span>
        </Link>
      </section>
    </section>
  );
}
