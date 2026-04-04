import { Link } from 'react-router-dom';
import { Panel } from '../components/ui/Panel';
import './LeaderboardPage.css';

export function LeaderboardPage() {
  return (
    <Panel title="Leaderboard" subtitle="Top YOVI players">
      <section className="leaderboard-card">
        <h2>Coming soon</h2>
        <p>The live ranking board is being prepared. Play games to build your stats and climb once it launches.</p>
        <div className="leaderboard-actions">
          <Link to="/games/new" className="leaderboard-link">Create New Game</Link>
          <Link to="/games/history" className="leaderboard-link leaderboard-link--secondary">Game History</Link>
        </div>
      </section>
    </Panel>
  );
}

