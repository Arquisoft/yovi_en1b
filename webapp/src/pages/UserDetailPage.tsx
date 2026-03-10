import { useParams } from 'react-router-dom';

export default function UserDetailPage() {
  const { id } = useParams();
  return <h1>User Detail: {id}</h1>;
}
