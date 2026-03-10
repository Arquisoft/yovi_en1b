import { Link } from 'react-router-dom';
import './HomePage.css';

type HomePageProps = {
  userId: string;
};

export default function HomePage({ userId }: HomePageProps) {
  return (
    <div className="home-actions">
      <h1>Homepage</h1>
      <div className="home-actions-grid">
        <Link to="/games/new" className="home-action-button">
          Nova hra
        </Link>
        <Link to={`/users/${userId}/history`} className="home-action-button">
          Historie her
        </Link>
      </div>
    </div>
  );
}
