import { useParams } from 'react-router-dom';

export default function GameHistoryPage() {
  const { id } = useParams();
  return <h1>Game history uzivatele: {id}</h1>;
}

