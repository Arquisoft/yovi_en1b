import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { finishGame, getGame, playBotTurn, submitMove, undoMove } from '../api/gamesApi';
import type { Coordinates, GameRecord, Move } from '../types/games';
import { Panel } from '../components/ui/Panel';
import { formatGameLabel } from '../utils/gameLabels';
import {
  coordinateKey,
  getNeighborCoordinates,
  parseYenState,
  type YenCellState
} from '../utils/yenState';
import './GamePage.css';

const HEX_SIZE = 60;
const HEX_GAP = 2;
const COL_STEP = HEX_SIZE + HEX_GAP;
const EXPLOSION_ANIMATION_MS = 520;

interface HexCell {
  coordinates: Coordinates;
}

interface BoardProps {
  readonly boardSize: number;
  readonly rows: HexCell[][];
  readonly canPlay: boolean;
  readonly cellStateByKey: Map<string, YenCellState>;
  readonly onPlayMove: (coordinates: Coordinates) => Promise<void>;
  readonly visualTurn: 'B' | 'R';
  readonly highlightedCellKey: string | null;
  readonly previewNeighborKeys: ReadonlySet<string>;
  readonly explodingCellKeys: ReadonlySet<string>;
  readonly onBoardHover: (coordinates: Coordinates | null) => void;
}

interface MoveHistoryProps {
  readonly moves: Move[];
  readonly bluePlayerName: string;
  readonly redPlayerName: string;
  readonly onMoveHover: (coordinates: Coordinates | null) => void;
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
    return 'Bot is thinking...';
  }

  const playerName = game.current_turn === 'B' ? 'Blue' : 'Red';
  return `${playerName} to move`;
}

function getEnemyTitle(game: GameRecord): string {
  if (game.game_type === 'BOT') {
    return 'Bot';
  }

  return game.name_of_enemy ?? 'Player 2 (Red)';
}

function getOwnerClass(owner: Move['player'] | null | undefined): string {
  if (owner === 'B') {
    return ' blue';
  }

  if (owner === 'R') {
    return ' red';
  }

  return '';
}

function getCellAriaLabel(coordinates: Coordinates, cellState: YenCellState | undefined): string {
  const owner = cellState?.owner;

  if (owner === 'B') {
    return `Hex (${coordinates.x}, ${coordinates.y}, ${coordinates.z}) - Blue`;
  }

  if (owner === 'R') {
    return `Hex (${coordinates.x}, ${coordinates.y}, ${coordinates.z}) - Red`;
  }

  if (cellState?.hasMine) {
    return `Hex (${coordinates.x}, ${coordinates.y}, ${coordinates.z}) - mine`;
  }

  return `Hex (${coordinates.x}, ${coordinates.y}, ${coordinates.z})`;
}

function getRowKey(row: HexCell[]): string {
  const first = row[0]?.coordinates;
  return first ? `row-${first.x}-${first.y}-${first.z}-${row.length}` : `row-empty-${row.length}`;
}

function Board({
  boardSize,
  rows,
  canPlay,
  cellStateByKey,
  onPlayMove,
  visualTurn,
  highlightedCellKey,
  previewNeighborKeys,
  explodingCellKeys,
  onBoardHover
}: BoardProps) {
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
              const state = cellStateByKey.get(key);
              const ownerClass = getOwnerClass(state?.owner);
              const isOccupied = Boolean(state?.owner);
              const hasMine = Boolean(state?.hasMine) && !isOccupied;
              const disabled = !canPlay || isOccupied;
              const isHighlighted = highlightedCellKey === key;
              const isNeighborPreview = previewNeighborKeys.has(key);
              const isExploding = explodingCellKeys.has(key);
              const cellClass = `hex-wrap${ownerClass}${disabled ? ' hex-wrap--disabled' : ''}${isHighlighted ? ' hex-wrap--history-highlight' : ''}${hasMine ? ' hex-wrap--mine' : ''}${isNeighborPreview ? ' hex-wrap--mine-neighbor' : ''}${isExploding ? ' hex-wrap--exploding' : ''} turn-indicator-${visualTurn}`;

              return (
                <button
                  key={key}
                  type="button"
                  className={cellClass}
                  disabled={disabled}
                  aria-disabled={disabled}
                  aria-label={getCellAriaLabel(cell.coordinates, state)}
                  onMouseEnter={() => onBoardHover(cell.coordinates)}
                  onMouseLeave={() => onBoardHover(null)}
                  onFocus={() => onBoardHover(cell.coordinates)}
                  onBlur={() => onBoardHover(null)}
                  onClick={() => {
                    void onPlayMove(cell.coordinates);
                  }}
                >
                  <div className={`hex${ownerClass}`}>
                    {hasMine ? <span className="hex-mine" aria-hidden="true" /> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function MoveHistory({ moves, bluePlayerName, redPlayerName, onMoveHover }: MoveHistoryProps) {
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
            <li
              key={move.move_number}
              className="move-history-item"
              onMouseEnter={() => onMoveHover(move.coordinates)}
              onMouseLeave={() => onMoveHover(null)}
              onFocus={() => onMoveHover(move.coordinates)}
              onBlur={() => onMoveHover(null)}
            >
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

function getLegacyCellStateFromMoves(moves: Move[]): Map<string, YenCellState> {
  const map = new Map<string, YenCellState>();

  for (const move of moves) {
    map.set(coordinateKey(move.coordinates), {
      owner: move.player,
      hasMine: false
    });
  }

  return map;
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
  const [highlightedCellKey, setHighlightedCellKey] = useState<string | null>(null);
  const [hoveredCellKey, setHoveredCellKey] = useState<string | null>(null);
  const [explodingCellKeys, setExplodingCellKeys] = useState<Set<string>>(new Set());
  const explosionResetTimeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (explosionResetTimeoutRef.current !== null) {
        globalThis.clearTimeout(explosionResetTimeoutRef.current);
      }
    };
  }, []);

  const rows = useMemo(() => (game ? buildBoard(game.board_size) : []), [game]);

  useEffect(() => {
    setHighlightedCellKey(null);
  }, [game?.moves]);

  // Prefer the latest move's state; before any move is made, fall back to the
  // initial state Gamey produced at game creation (so pre-placed bombs for the
  // Explosions variant are visible immediately). After the game finishes we
  // display the final state.
  const latestYenState =
    game?.moves.at(-1)?.yen_state
    ?? game?.yen_final_state
    ?? game?.initial_yen_state
    ?? null;

  const cellStateByKey = useMemo(() => {
    if (!game) {
      return new Map<string, YenCellState>();
    }

    if (latestYenState) {
      return parseYenState(game.board_size, latestYenState);
    }

    return getLegacyCellStateFromMoves(game.moves);
  }, [game, latestYenState]);

  const minePreviewNeighbors = useMemo(() => {
    if (!game || !hoveredCellKey) {
      return new Set<string>();
    }

    const hoveredCell = cellStateByKey.get(hoveredCellKey);
    if (!hoveredCell?.hasMine || hoveredCell.owner) {
      return new Set<string>();
    }

    const [x, y, z] = hoveredCellKey.split(':').map(Number);
    if ([x, y, z].some((value) => Number.isNaN(value))) {
      return new Set<string>();
    }

    return new Set(
      getNeighborCoordinates(game.board_size, { x, y, z }).map((coordinates) => coordinateKey(coordinates))
    );
  }, [game, hoveredCellKey, cellStateByKey]);

  const blueMoves = (game?.moves ?? []).filter((move) => move.player === 'B').length;
  const redMoves = (game?.moves ?? []).filter((move) => move.player === 'R').length;
  const inProgress = game?.status === 'IN_PROGRESS';
  const canPlay = inProgress
    && !actionLoading
    && !botThinking
    && (game.game_type === 'PLAYER' || game.current_turn === 'B');
  const visualTurn: 'B' | 'R' = botThinking ? 'R' : (game?.current_turn ?? 'B');

  const playMoveAt = async (coordinates: Coordinates) => {
    if (!id || !canPlay) {
      return;
    }

    const key = coordinateKey(coordinates);
    const currentCell = cellStateByKey.get(key);
    if (currentCell?.owner) {
      return;
    }

    const shouldAnimateExplosion = Boolean(currentCell?.hasMine);

    setActionLoading(true);
    setError(null);

    try {
      const next = await submitMove(id, { coordinates });
      setGame(next);

      if (shouldAnimateExplosion && game) {
        const blastKeys = new Set<string>([key]);
        for (const neighbor of getNeighborCoordinates(game.board_size, coordinates)) {
          blastKeys.add(coordinateKey(neighbor));
        }

        setExplodingCellKeys(blastKeys);

        if (explosionResetTimeoutRef.current !== null) {
          globalThis.clearTimeout(explosionResetTimeoutRef.current);
        }

        explosionResetTimeoutRef.current = globalThis.setTimeout(() => {
          setExplodingCellKeys(new Set());
        }, EXPLOSION_ANIMATION_MS);
      }
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
      const next = await finishGame(id, { result: 'SURRENDERED', duration_seconds: elapsed });
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
    return 'surrendered';
  };

  const getResultText = (): string => {
    if (game.result === 'WIN') return 'YOU WIN';
    if (game.result === 'LOSS') return 'YOU LOSE';
    return 'SURRENDERED';
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
                    title="Surrender game"
                    aria-label="Surrender game"
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
            {game.game_type === 'BOT' && (
              <div className="bot-meta-tags" aria-label="Bot settings">
                <span className="difficulty-tag">Difficulty: {formatGameLabel(game.difficulty_level)}</span>
                <span className="difficulty-tag">Strategy: {formatGameLabel(game.strategy)}</span>
              </div>
            )}
          </article>
        </header>

        {error && <p className="game-error">{error}</p>}

        <Board
          boardSize={game.board_size}
          rows={rows}
          canPlay={canPlay}
          cellStateByKey={cellStateByKey}
          onPlayMove={playMoveAt}
          visualTurn={visualTurn}
          highlightedCellKey={highlightedCellKey}
          previewNeighborKeys={minePreviewNeighbors}
          explodingCellKeys={explodingCellKeys}
          onBoardHover={(coordinates) => setHoveredCellKey(coordinates ? coordinateKey(coordinates) : null)}
        />

        <MoveHistory
          moves={game.moves}
          bluePlayerName="You"
          redPlayerName={enemyTitle}
          onMoveHover={(coordinates) => setHighlightedCellKey(coordinates ? coordinateKey(coordinates) : null)}
        />
      </div>
    </Panel>
  );
}
