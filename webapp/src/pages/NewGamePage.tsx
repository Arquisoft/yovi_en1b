import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGame } from '../api/gamesApi';
import './NewGamePage.css';

type GameMode = 'player' | 'ai';
type AiLevel = 'easy' | 'medium' | 'hard';

type FormState = {
  mode: GameMode;
  opponentNickname: string;
  aiLevel: AiLevel;
  boardSize: number;
  specialRules: 'normal';
};

export default function NewGamePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    mode: 'ai',
    opponentNickname: '',
    aiLevel: 'medium',
    boardSize: 5,
    specialRules: 'normal'
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (form.boardSize < 3 || form.boardSize > 20) {
      setError('Board size must be between 3 and 20.');
      return;
    }

    if (form.mode === 'player' && !form.opponentNickname.trim()) {
      setError('For player-vs-player mode, enter opponent nickname.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        board_size: form.boardSize,
        strategy: form.mode === 'ai' ? 'random' : 'human',
        difficulty_level: form.mode === 'ai' ? form.aiLevel : 'medium'
      } as const;

      const game = await createGame(payload);
      navigate(`/games/${game._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the game.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="new-game-page">
      <h1>Create New Game</h1>

      <form className="new-game-form" onSubmit={submit}>
        <fieldset>
          <legend>Game mode</legend>
          <label>
            <input
              type="radio"
              checked={form.mode === 'player'}
              onChange={() => setForm((v) => ({ ...v, mode: 'player' }))}
            />
            Against another player
          </label>
          <label>
            <input
              type="radio"
              checked={form.mode === 'ai'}
              onChange={() => setForm((v) => ({ ...v, mode: 'ai' }))}
            />
            Against AI
          </label>
        </fieldset>

        {form.mode === 'player' ? (
          <label>
            Opponent nickname
            <input
              type="text"
              value={form.opponentNickname}
              onChange={(e) => setForm((v) => ({ ...v, opponentNickname: e.target.value }))}
              placeholder="e.g. John42"
            />
          </label>
        ) : (
          <label>
            AI difficulty
            <select
              value={form.aiLevel}
              onChange={(e) => setForm((v) => ({ ...v, aiLevel: e.target.value as AiLevel }))}
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </label>
        )}

        <label>
          Board size (triangle)
          <input
            type="number"
            min={3}
            max={20}
            value={form.boardSize}
            onChange={(e) => setForm((v) => ({ ...v, boardSize: Number(e.target.value) || 0 }))}
          />
        </label>

        <label>
          Special rules
          <select
            value={form.specialRules}
            onChange={(e) => setForm((v) => ({ ...v, specialRules: e.target.value as 'normal' }))}
          >
            <option value="normal">normal</option>
          </select>
        </label>

        {error ? <p className="new-game-error">{error}</p> : null}

        <button type="submit" disabled={loading}>
          {loading ? 'Creating game...' : 'Create game'}
        </button>
      </form>
    </section>
  );
}
