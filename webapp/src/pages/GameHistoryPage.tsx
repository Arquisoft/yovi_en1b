import { useParams } from 'react-router-dom';

export default function GameHistoryPage() {
  const { id } = useParams();
  return <h1>User Game History: {id}</h1>;
}
