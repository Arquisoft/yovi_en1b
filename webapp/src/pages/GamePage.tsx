import { useParams } from 'react-router-dom';
import { Game } from '../components/Game';

export default function GamePage() {
  const { id } = useParams();

  return (
    <div>
      <h1>Hra: {id}</h1>
      <Game />
    </div>
  );
}
