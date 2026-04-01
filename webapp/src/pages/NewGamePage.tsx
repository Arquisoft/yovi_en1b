import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGame } from '../api/gamesApi';
import { Panel } from '../components/ui/Panel';
import type { CreateGamePayload, DifficultyLevel, GameType, Strategy } from '../types/games';
import './NewGamePage.css';

/**
 * Helper to determine bot strategy based on difficulty.
 * Ready for expansion with difficulty-specific strategies.
 * Future: allow user to select strategy directly.
 */
function getStrategyForDifficulty(difficulty: DifficultyLevel): Strategy {
  const strategyMap: Record<DifficultyLevel, Strategy> = {
    easy: 'random',
    medium: 'balanced',
    hard: 'aggressive'
  };
  return strategyMap[difficulty];
}

export function NewGamePage() {
  const navigate = useNavigate();
  const [gameType, setGameType] = useState<GameType>('BOT');
  const [boardSize, setBoardSize] = useState(5);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [opponentName, setOpponentName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opponentNameError = error === 'Please enter opponent name';

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedOpponentName = opponentName.trim();
    if (gameType === 'PLAYER' && !trimmedOpponentName) {
      setError('Please enter opponent name');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const payload: CreateGamePayload = {
        board_size: boardSize,
        game_type: gameType,
        difficulty_level: difficulty,
        strategy: getStrategyForDifficulty(difficulty),
        rule_set: 'normal'
      };

      if (gameType === 'PLAYER') {
        payload.name_of_enemy = trimmedOpponentName;
      }

      const game = await createGame(payload);
      navigate(`/games/${game._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="New Game" subtitle="Configure your game and start playing">
      <form onSubmit={handleCreateGame} className="new-game-form">
        {/* Opponent Selection */}
        <fieldset className="form-section">
          <legend>Opponent</legend>
          <div className="form-group">
            <label className="radio-label">
              <input
                type="radio"
                name="gameType"
                value="BOT"
                checked={gameType === 'BOT'}
                onChange={(e) => setGameType(e.target.value as GameType)}
                disabled={loading}
              />
              <span className="radio-text">
                <strong>Play vs AI</strong>
                <small>Challenge the computer</small>
              </span>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="gameType"
                value="PLAYER"
                checked={gameType === 'PLAYER'}
                onChange={(e) => setGameType(e.target.value as GameType)}
                disabled={loading}
              />
              <span className="radio-text">
                <strong>Play vs Player</strong>
                <small>Local multiplayer on this device</small>
              </span>
            </label>
          </div>

          {gameType === 'PLAYER' && (
            <div className="form-field">
              <label htmlFor="opponentName">Opponent Name</label>
              <input
                id="opponentName"
                type="text"
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                placeholder="Enter opponent's name"
                disabled={loading}
                aria-invalid={opponentNameError}
                aria-describedby={opponentNameError ? 'new-game-error' : undefined}
              />
            </div>
          )}
        </fieldset>

        {/* Board Size */}
        <fieldset className="form-section">
          <legend>Board Size</legend>
          <div className="form-field">
            <label htmlFor="boardSize">Triangle Side Length: {boardSize}</label>
            <input
              id="boardSize"
              type="range"
              min="3"
              max="15"
              value={boardSize}
              onChange={(e) => setBoardSize(Number(e.target.value))}
              disabled={loading}
              className="slider"
            />
            <div className="size-info">
              <span>Smaller (3)</span>
              <span>Larger (15)</span>
            </div>
          </div>
        </fieldset>

        {/* AI Difficulty */}
        {gameType === 'BOT' && (
          <fieldset className="form-section">
            <legend>AI Difficulty</legend>
            <div className="form-group">
              <label className="radio-label">
                <input
                  type="radio"
                  name="difficulty"
                  value="easy"
                  checked={difficulty === 'easy'}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  disabled={loading}
                />
                <span className="radio-text">
                  <strong>Easy</strong>
                  <small>Random moves</small>
                </span>
              </label>

              <label className="radio-label">
                <input
                  type="radio"
                  name="difficulty"
                  value="medium"
                  checked={difficulty === 'medium'}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  disabled={loading}
                />
                <span className="radio-text">
                  <strong>Medium</strong>
                  <small>Balanced strategy</small>
                </span>
              </label>

              <label className="radio-label">
                <input
                  type="radio"
                  name="difficulty"
                  value="hard"
                  checked={difficulty === 'hard'}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  disabled={loading}
                />
                <span className="radio-text">
                  <strong>Hard</strong>
                  <small>Challenging AI</small>
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {/* Rules - Ready for future expansion (extended, custom) */}
        <fieldset className="form-section">
          <legend>Rules</legend>
          <div className="form-group">
            <label className="radio-label">
              <input
                type="radio"
                name="rules"
                value="normal"
                defaultChecked
                disabled={loading}
              />
              <span className="radio-text">
                <strong>Standard Rules</strong>
                <small>Connect three sides of the triangle</small>
              </span>
            </label>
            {/* Additional rule sets (extended, custom) to be added here */}
          </div>
        </fieldset>

        {/* Actions */}
        <div className="form-actions">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Creating game...' : 'Start Game'}
          </button>
        </div>

        {error && <div id="new-game-error" className="form-error">{error}</div>}
      </form>
    </Panel>
  );
}
