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

interface BoardProps {
  readonly boardSize: number;
  readonly rows: HexCell[][];
  readonly canPlay: boolean;
  readonly movesByCell: Map<string, Move>;
  readonly onPlayMove: (coordinates: Coordinates) => Promise<void>;
  readonly visualTurn: 'B' | 'R';
}

interface MoveHistoryProps {
  readonly moves: Move[];
  readonly bluePlayerName: string;
  readonly redPlayerName: string;
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
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function isInProgress(game: GameRecord | null): game is GameRecord {
  return game?.status === 'IN_PROGRESS';
}

function getTurnStatusText(game: GameRecord, botThinking: boolean): string {
  if (game.status === 'FINISHED') {
    return game.result ?? 'FINISHED';
  }

  if (botThinking) {
    return 'AI is thinking...';
  }

  const playerName = game.current_turn === 'B' ? 'Blue' : 'Red';
  return `${playerName} to move`;
}

function getEnemyTitle(game: GameRecord): string {
  if (game.game_type === 'BOT') {
    return 'AI';
  }

  return game.name_of_enemy ?? 'Player 2 (Red)';
}

function getOwnerClass(owner: Move['player'] | undefined): string {
  if (owner === 'B') {
    return ' blue';
  }

  if (owner === 'R') {
    return ' red';
  }

  return '';
}

function getCellAriaLabel(coordinates: Coordinates, owner: Move['player'] | undefined): string {
  let ownerLabel: string | null = null;

  if (owner === 'B') {
    ownerLabel = 'Blue';
  } else if (owner === 'R') {
    ownerLabel = 'Red';
  }

  const suffix = ownerLabel ? ` - ${ownerLabel}` : '';
  return `Hex (${coordinates.x}, ${coordinates.y}, ${coordinates.z})${suffix}`;
}

function getRowKey(row: HexCell[]): string {
  const first = row[0]?.coordinates;
  return first ? `row-${first.x}-${first.y}-${first.z}-${row.length}` : `row-empty-${row.length}`;
}

function Board({ boardSize, rows, canPlay, movesByCell, onPlayMove, visualTurn }: BoardProps) {
  return (
    <section className="board-wrap">
      <div className="board" aria-label="game board">
        {rows.map((row) => (
          <div
            key={getRowKey(row)}
            className="board-row"
            style={{ marginLeft: rowOffset(boardSize, row.length) }}
          >
            {row.map((cell) => {
              const key = coordinateKey(cell.coordinates);
              const owner = movesByCell.get(key)?.player;
              const ownerClass = getOwnerClass(owner);
              const disabled = !canPlay || Boolean(owner);
              const cellLabel = getCellAriaLabel(cell.coordinates, owner);
              const cellClass = `hex-wrap${ownerClass}${disabled ? ' hex-wrap--disabled' : ''} turn-indicator-${visualTurn}`;

              return (
                <button
                  key={key}
                  type="button"
                  className={cellClass}
                  disabled={disabled}
                  aria-disabled={disabled}
                  aria-label={cellLabel}
                  onClick={() => {
                    void onPlayMove(cell.coordinates);
                  }}
                >
                  <div className={`hex${ownerClass}`}>{owner ?? ''}</div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

interface MoveHistoryProps {
  readonly moves: Move[];
  readonly bluePlayerName: string;
  readonly redPlayerName: string;
}

function MoveHistory({ moves, bluePlayerName, redPlayerName }: MoveHistoryProps) {
  const orderedMoves = useMemo(() => [...moves].reverse(), [moves]);

  if (moves.length === 0) {
    return (
      <section className="move-history">
        <h3>Move History</h3>
        <p>No moves yet.</p>
      </section>
    );
  }

  return (
    <section className="move-history">
      <h3>Move History</h3>
      <ol className="move-history-list">
        {orderedMoves.map((move) => {
          const isBlue = move.player === 'B';
          const playerName = isBlue ? bluePlayerName : redPlayerName;
          const badgeClass = isBlue ? 'blue' : 'red';

          return (
            <li key={move.move_number} className="move-history-item">
              <span className="move-number">#{move.move_number}</span>
              <span className={`move-player-badge ${badgeClass}`}>{playerName}</span>
              <span className="move-text">
                ({move.coordinates.x}, {move.coordinates.y}, {move.coordinates.z})
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function GamePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!id) {
      setError('Game id is missing');
      setLoading(false);
      return;
    }

    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const loadedGame = await getGame(id);

        if (mounted) {
          setGame(loadedGame);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load game');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    if (!isInProgress(game)) {
      return;
    }

    const created = new Date(game.created_at).getTime();
    const updateElapsed = () => {
      const timeFromStart = Math.floor((Date.now() - created) / 1000);
      const safeElapsed = Number.isNaN(created)
        ? game.duration_seconds
        : Math.max(game.duration_seconds, timeFromStart);
      setElapsed(safeElapsed);
    };

    updateElapsed();
    const timer = globalThis.setInterval(updateElapsed, 1000);

    return () => {
      globalThis.clearInterval(timer);
    };
  }, [game]);

  useEffect(() => {
    if (!id || !isInProgress(game) || game.game_type !== 'BOT' || game.current_turn !== 'R') {
      return;
    }

    setBotThinking(true);
    const timeout = globalThis.setTimeout(async () => {
      try {
        const next = await playBotTurn(id);
        setGame(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bot move failed');
      } finally {
        setBotThinking(false);
      }
    }, 450);

    return () => {
      globalThis.clearTimeout(timeout);
    };
  }, [id, game]);

  const rows = useMemo(() => (game ? buildBoard(game.board_size) : []), [game]);

  const movesByCell = useMemo(() => {
    const map = new Map<string, Move>();

    for (const move of game?.moves ?? []) {
      map.set(coordinateKey(move.coordinates), move);
    }

    return map;
  }, [game?.moves]);

  const blueMoves = (game?.moves ?? []).filter((move) => move.player === 'B').length;
  const redMoves = (game?.moves ?? []).filter((move) => move.player === 'R').length;
  const inProgress = game?.status === 'IN_PROGRESS';
  const canPlay = inProgress
    && !actionLoading
    && !botThinking
    && (game.game_type === 'PLAYER' || game.current_turn === 'B');
  const visualTurn: 'B' | 'R' = botThinking ? 'R' : (game?.current_turn ?? 'B');

  const playMoveAt = async (coordinates: Coordinates) => {
    if (!id || !canPlay || movesByCell.has(coordinateKey(coordinates))) {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const next = await submitMove(id, { coordinates });
      setGame(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit move');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!id || game?.status !== 'IN_PROGRESS') {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const next = await undoMove(id);
      setGame(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo move');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!id || game?.status !== 'IN_PROGRESS') {
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const next = await finishGame(id, { result: 'DRAW', duration_seconds: elapsed });
      setGame(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish game');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="game-page">
        <p>Loading game...</p>
      </section>
    );
  }

  if (!game) {
    return (
      <section className="game-page">
        <p>{error ?? 'Game not found.'}</p>
        <button type="button" onClick={() => navigate('/games/new')}>Create New Game</button>
      </section>
    );
  }

  const shellClass = `game-shell ${visualTurn === 'B' ? 'turn-blue' : 'turn-red'}`;
  const bluePanelClass = `player-panel player-panel--blue ${visualTurn === 'B' && inProgress ? 'active' : ''}`;
  const redPanelClass = `player-panel player-panel--red ${visualTurn === 'R' && inProgress ? 'active' : ''}`;
  const displayedDuration = game.status === 'FINISHED' ? game.duration_seconds : elapsed;
  const enemyTitle = getEnemyTitle(game);
  const statusText = getTurnStatusText(game, botThinking);

  const getResultBoxClass = (): string => {
    if (game.result === 'WIN') return 'blue';
    if (game.result === 'LOSS') return 'red';
    return 'draw';
  };

  const getResultText = (): string => {
    if (game.result === 'WIN') return 'YOU WIN';
    if (game.result === 'LOSS') return 'YOU LOSE';
    return 'DRAW';
  };

  return (
    <Panel title="Game" subtitle="Ongoing game session">
      <div className={shellClass}>
        <header className="game-header-panels">
          <article className={bluePanelClass}>
            <h3>You</h3>
            <p>Moves: {blueMoves}</p>
          </article>

          <article className="center-panel">
            <div className="center-panel-top">
              {inProgress && (
                <>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={handleUndo}
                    disabled={actionLoading || game.moves.length === 0 || !inProgress}
                    title="Undo last move"
                    aria-label="Undo last move"
                  >
                    ↶
                  </button>
                  <p className="center-time">{formatDuration(displayedDuration)}</p>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    onClick={handleFinish}
                    disabled={actionLoading || !inProgress}
                    title="Finish game as draw"
                    aria-label="Finish game as draw"
                  >
                    ⏹
                  </button>
                </>
              )}
              {!inProgress && (
                <div className={`game-result-box game-result-box--${getResultBoxClass()}`}>
                  <p className="game-result-time">{formatDuration(displayedDuration)}</p>
                  <p className="game-result-text">{getResultText()}</p>
                </div>
              )}
            </div>
            {inProgress && <p>{statusText}</p>}
          </article>

          <article className={redPanelClass}>
            <h3>{enemyTitle}</h3>
            <p>Moves: {redMoves}</p>
            {game.game_type === 'BOT' && <p>{game.difficulty_level} / {game.strategy}</p>}
          </article>
        </header>

        {error && <p className="game-error">{error}</p>}

        <Board
          boardSize={game.board_size}
          rows={rows}
          canPlay={canPlay}
          movesByCell={movesByCell}
          onPlayMove={playMoveAt}
          visualTurn={visualTurn}
        />

        <MoveHistory
          moves={game.moves}
          bluePlayerName="You"
          redPlayerName={enemyTitle}
        />
      </div>
    </Panel>
  );
}
