import { useGameBot } from './hooks/useGameBot';

export function Game() {
  const { result, loading, askBot } = useGameBot();

  return (
    <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h3>Gamey Backend</h3>
      <p style={{ fontSize: '0.9rem', color: '#666' }}>
        Tests bot API communication. Coordinates use barycentric system (x, y, z).
      </p>
      <button onClick={askBot} disabled={loading}>
        {loading ? 'Waiting...' : 'Ask Random Bot'}
      </button>
      {result && (
        <p style={{ marginTop: '1rem', padding: '0.5rem', borderRadius: '4px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          {result}
        </p>
      )}
    </div>
  );
}
