import { Link } from 'react-router-dom';
import { Panel } from '../components/ui/Panel';
import './HomePage.css';

export function HomePage() {
  return (
    <Panel title="Home" subtitle="Welcome to Game Y">
      <div className="home-actions">
        <Link to="/games/new" className="home-action home-action--primary">
          Create New Game
        </Link>
        <Link to="/games/history" className="home-action">
          Game History
        </Link>
      </div>
    </Panel>
  );
}
