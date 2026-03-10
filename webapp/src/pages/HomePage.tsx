import { Link } from 'react-router-dom';
import './HomePage.css';

type HomePageProps = {
  userId: string;
};

export default function HomePage({ userId }: HomePageProps) {
  return (
    <div className="home-actions">
      <h1>Home</h1>
      <div className="home-actions-grid">
        <Link to="/games/new" className="home-action-button">
          New Game
        </Link>
        <Link to={`/users/${userId}/history`} className="home-action-button">
          Game History
        </Link>
      </div>
    </div>
  );
}
