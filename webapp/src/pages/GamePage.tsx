import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { finishGame, getGame, playBotTurn, submitMove, undoMove } from '../api/gamesApi';
import type { Coordinates, GameRecord, Move } from '../types/games';
import { Panel } from '../components/ui/Panel';
import './GamePage.css';

const HEX_SIZE = 60;
const HEX_GAP = 2;
const COL_STEP = HEX_SIZE + HEX_GAP;

interface HexCell {
  coordinates: Coordinates;
}

function buildBoard(size: number): HexCell[][] {
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: row + 1 }, (_, col) => ({
      coordinates: { x: col, y: row - col, z: size - 1 - row }
    }))
  );
}

function rowOffset(size: number, rowLen: number): number {
  return ((size - rowLen) * COL_STEP) / 2;
}

function coordinateKey(c: Coordinates): string {
  return `${c.x}:${c.y}:${c.z}`;
}

function formatDuration(seconds: number): string {
  const safe    = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest    = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function GamePage() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const [game, setGame]                 = useState<GameRecord | null>(null);
  const [loading, setLoading]           = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [botThinking, setBotThinking]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [elapsed, setElapsed]           = useState(0);

  useEffect(() => {
    if (!id) { setError('Game id is missing'); setLoading(false); return; }
    let mounted = true;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const g = await getGame(id);
        if (mounted) setGame(g);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load game');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [id]);

  useEffect(() => {
    if (!game || game.status !== 'IN_PROGRESS') return;
    const created     = new Date(game.created_at).getTime();
    const updateElapsed = () => {
      setElapsed(Number.isNaN(created)
        ? game.duration_seconds
        : Math.max(game.duration_seconds, Math.floor((Date.now() - created) / 1000)));
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [game]);

  useEffect(() => {
    if (!id || !game || game.status !== 'IN_PROGRESS' || game.game_type !== 'BOT' || game.current_turn !== 'R') return;
    setBotThinking(true);
    const timeout = window.setTimeout(async () => {
      try {
        const next = await playBotTurn(id);
        setGame(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bot move failed');
      } finally {
        setBotThinking(false);
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [id, game]);

  const rows = useMemo(() => (game ? buildBoard(game.board_size) : []), [game]);
  const movesByCell = useMemo(() => {
    const map = new Map<string, Move>();
    for (const move of game?.moves ?? []) map.set(coordinateKey(move.coordinates), move);
    return map;
  }, [game?.moves]);

  const blueMoves   = (game?.moves ?? []).filter(m => m.player === 'B').length;
  const redMoves    = (game?.moves ?? []).filter(m => m.player === 'R').length;
  const orderedMoves = useMemo(() => [...(game?.moves ?? [])].reverse(), [game?.moves]);

  const canPlay    = Boolean(game && game.status === 'IN_PROGRESS' && !actionLoading && !botThinking
    && (game.game_type === 'PLAYER' || game.current_turn === 'B'));
  const visualTurn: 'B' | 'R' = botThinking ? 'R' : (game?.current_turn ?? 'B');

  const playMoveAt = async (coordinates: Coordinates) => {
    if (!id || !game || !canPlay || movesByCell.has(coordinateKey(coordinates))) return;
    setActionLoading(true); setError(null);
    try {
      setGame(await submitMove(id, { coordinates }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit move');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!id || !game || game.status !== 'IN_PROGRESS') return;
    setActionLoading(true); setError(null);
    try { setGame(await undoMove(id)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not undo move'); }
    finally { setActionLoading(false); }
  };

  const handleFinish = async () => {
    if (!id || !game || game.status !== 'IN_PROGRESS') return;
    setActionLoading(true); setError(null);
    try { setGame(await finishGame(id, { result: 'DRAW', duration_seconds: elapsed })); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not finish game'); }
    finally { setActionLoading(false); }
  };

  if (loading) return <section className="game-page"><p>Loading game...</p></section>;

  if (!game) {
    return (
      <section className="game-page">
        <p>{error ?? 'Game not found.'}</p>
        <button type="button" onClick={() => navigate('/games/new')}>Create New Game</button>
      </section>
    );
  }

  return (
    <Panel title="Game" subtitle="Ongoing game session">
      <div className={`game-shell ${visualTurn === 'B' ? 'turn-blue' : 'turn-red'}`}>
        <header className="game-header-panels">
          <article className={`player-panel player-panel--blue ${visualTurn === 'B' && game.status === 'IN_PROGRESS' ? 'active' : ''}`}>
            <h3>You (Blue)</h3>
            <p>Moves: {blueMoves}</p>
          </article>

          <article className="center-panel">
            <div className="center-panel-top">
              <button
                type="button" className="icon-btn"
                onClick={handleUndo}
                disabled={actionLoading || game.moves.length === 0 || game.status !== 'IN_PROGRESS'}
                title="Undo last move" aria-label="Undo last move"
              >↶</button>
              <p className="center-time">
                {formatDuration(game.status === 'FINISHED' ? game.duration_seconds : elapsed)}
              </p>
              <button
                type="button" className="icon-btn icon-btn--danger"
                onClick={handleFinish}
                disabled={actionLoading || game.status !== 'IN_PROGRESS'}
                title="Finish game as draw" aria-label="Finish game as draw"
              >⏹</button>
            </div>
            <p>
              {game.status === 'FINISHED'
                ? game.result
                : botThinking
                  ? 'AI is thinking…'
                  : `${game.current_turn === 'B' ? 'Blue' : 'Red'} to move`}
            </p>
          </article>

          <article className={`player-panel player-panel--red ${visualTurn === 'R' && game.status === 'IN_PROGRESS' ? 'active' : ''}`}>
            <h3>{game.game_type === 'BOT' ? 'AI (Red)' : (game.name_of_enemy ?? 'Player 2 (Red)')}</h3>
            <p>Moves: {redMoves}</p>
            {game.game_type === 'BOT' ? <p>{game.difficulty_level} / {game.strategy}</p> : null}
          </article>
        </header>

        {error ? <p className="game-error">{error}</p> : null}

        <section className="board-wrap">
          <div className="board" aria-label="game board">
            {rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="board-row"
                style={{ marginLeft: rowOffset(game.board_size, row.length) }}
              >
                {row.map((cell) => {
                  const key = coordinateKey(cell.coordinates);
                  const owner = movesByCell.get(key)?.player;
                  const disabled = !canPlay || Boolean(owner);
                  const ownerClass = owner === 'B' ? ' blue' : owner === 'R' ? ' red' : '';

                  return (
                    <div
                      key={key}
                      className={`hex-wrap${ownerClass}${disabled ? ' hex-wrap--disabled' : ''}`}
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      aria-disabled={disabled}
                      aria-label={`Hex (${cell.coordinates.x}, ${cell.coordinates.y}, ${cell.coordinates.z})${owner ? ` - ${owner === 'B' ? 'Blue' : 'Red'}` : ''}`}
                      onClick={() => {
                        if (!disabled) {
                          void playMoveAt(cell.coordinates);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          void playMoveAt(cell.coordinates);
                        }
                      }}
                    >
                      <div className={`hex${ownerClass}`}>{owner ?? ''}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <section className="move-history">
          <h3>Move History</h3>
          {game.moves.length === 0 ? (
            <p>No moves yet.</p>
          ) : (
            <ol className="move-history-list">
              {orderedMoves.map((move) => (
                <li key={move.move_number} className="move-history-item">
                  <span className={`move-player-badge ${move.player === 'B' ? 'blue' : 'red'}`}>
                    {move.player === 'B' ? 'Blue' : 'Red'}
                  </span>
                  <span className="move-text">
                    Move #{move.move_number}: places a stone on{' '}
                    <strong>({move.coordinates.x}, {move.coordinates.y}, {move.coordinates.z})</strong>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

      </div>
    </Panel>
  );
}
