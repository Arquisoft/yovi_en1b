import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getMoves } from '../api/gamesApi';
import { getUserHistory } from '../api/usersApi';
import { Panel } from '../components/ui/Panel';
import { useAuth } from '../hooks/useAuth';
import type { GameHistoryItem } from '../types/games';
import { formatGameLabel } from '../utils/gameLabels';
import './GameHistoryPage.css';

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function getOutcome(game: GameHistoryItem): 'win' | 'loss' | 'draw' | 'pending' {
  if (game.status !== 'FINISHED') return 'pending';
  if (game.result === 'WIN') return 'win';
  if (game.result === 'LOSS') return 'loss';
  if (game.result === 'DRAW') return 'draw';
  return 'pending';
}

function getEnemyLabel(game: GameHistoryItem, username: string | null): string {
  if (game.game_type === 'BOT') {
    return 'Bot';
  }

  const enemy = game.name_of_enemy?.trim();
  if (!enemy || enemy.toLowerCase() === 'local opponent') {
    return username ?? 'Player';
  }

  return enemy;
}

export function GameHistoryPage() {
  const { userId, username } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState<GameHistoryItem[]>([]);
  const [moveCounts, setMoveCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;

    async function loadHistory() {
      if (!userId) {
        if (alive) {
          setError('Missing user id in session. Please sign in again.');
          setLoading(false);
        }
        return;
      }

      if (alive) {
        setLoading(true);
        setError(null);
      }

      try {
        const history = await getUserHistory(userId);
        const moveEntries = await Promise.all(
          history.map(async (game) => {
            try {
              const moves = await getMoves(game._id);
              return [game._id, moves.length] as const;
            } catch {
              return [game._id, 0] as const;
            }
          })
        );

        if (alive) {
          setGames(history);
          setMoveCounts(Object.fromEntries(moveEntries));
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Failed to load game history');
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void loadHistory();
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  const sortedGames = useMemo(
    () => [...games].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
    [games]
  );

  return (
    <Panel title="Game History" subtitle="Your previously played games">
      <div className="history-page">
        {loading && <p>Loading history...</p>}

        {!loading && error && (
          <div className="history-error-wrap">
            <p className="history-error">{error}</p>
            <button type="button" className="history-retry" onClick={() => setReloadKey((value) => value + 1)}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && sortedGames.length === 0 && (
          <div className="history-empty">
            <p>No games yet. Start your first match.</p>
            <Link to="/games/new" className="history-action-link">Create New Game</Link>
          </div>
        )}

        {!loading && !error && sortedGames.length > 0 && (
          <ul className="history-list" aria-label="Played games history">
            {sortedGames.map((game) => {
              const enemy = getEnemyLabel(game, username);
              const outcome = getOutcome(game);
              const resultLabel = game.status === 'FINISHED' ? (game.result ?? 'FINISHED') : 'IN PROGRESS';

              return (
                <li key={game._id} className={`history-item history-item--${outcome}`}>
                  <button
                    type="button"
                    className="history-item__button"
                    onClick={() => navigate(`/games/${game._id}`)}
                    aria-label={`Open ${enemy} game from ${formatDate(game.created_at)}`}
                  >
                    <div className="history-item__top">
                      <span className="history-type">{game.game_type}</span>
                      <span className={`history-result history-result--${outcome}`}>{resultLabel}</span>
                    </div>

                    <div className="history-item__main">
                      <h3>{enemy}</h3>
                      <p>{formatDate(game.created_at)}</p>
                    </div>

                    <dl className="history-stats">
                      <div><dt>Moves</dt><dd>{moveCounts[game._id] ?? 0}</dd></div>
                      <div><dt>Board</dt><dd>{game.board_size}</dd></div>
                      <div><dt>Duration</dt><dd>{formatDuration(game.duration_seconds)}</dd></div>
                      {game.game_type === 'BOT' && (
                        <>
                          <div><dt>Difficulty</dt><dd>{formatGameLabel(game.difficulty_level)}</dd></div>
                          <div><dt>Strategy</dt><dd>{formatGameLabel(game.strategy)}</dd></div>
                        </>
                      )}
                    </dl>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
