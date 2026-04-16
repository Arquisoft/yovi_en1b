import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createGame, getGameOptions } from '../api/gamesApi';
import { Panel } from '../components/ui/Panel';
import type { CreateGamePayload, GameType, StrategyOption, VariantOption } from '../types/games';
import { formatGameLabel } from '../utils/gameLabels';
import './NewGamePage.css';

export function NewGamePage() {
  const navigate = useNavigate();
  const [gameType, setGameType] = useState<GameType>('BOT');
  const [boardSize, setBoardSize] = useState(5);
  const [opponentName, setOpponentName] = useState('');
  const [strategies, setStrategies] = useState<StrategyOption[]>([]);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [selectedStrategyName, setSelectedStrategyName] = useState('');
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opponentNameError = error === 'Please enter opponent name';

  useEffect(() => {
    let mounted = true;

    async function loadOptions() {
      try {
        const options = await getGameOptions();
        if (!mounted) return;

        setStrategies(options.strategies ?? []);
        setVariants(options.variants ?? []);
        if (options.strategies?.length) {
          setSelectedStrategyName(options.strategies[0].name);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load game options');
      } finally {
        if (mounted) {
          setLoadingOptions(false);
        }
      }
    }

    loadOptions();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.name === selectedStrategyName),
    [strategies, selectedStrategyName]
  );

  const normalizedStrategyName = selectedStrategyName.toLowerCase();

  const visibleVariants = useMemo(() => {
    if (gameType !== 'BOT') {
      return variants;
    }

    return variants.filter((variant) => {
      if (!variant.allowed_strategies?.length) {
        return true;
      }

      return variant.allowed_strategies.includes(normalizedStrategyName);
    });
  }, [gameType, variants, normalizedStrategyName]);

  const toggleVariant = (name: string) => {
    setSelectedVariants((current) => (
      current.includes(name)
        ? current.filter((variant) => variant !== name)
        : [...current, name]
    ));
  };

  useEffect(() => {
    setSelectedVariants((current) => current.filter((name) => visibleVariants.some((variant) => variant.name === name)));
  }, [visibleVariants]);

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedOpponentName = opponentName.trim();
    if (gameType === 'PLAYER' && !trimmedOpponentName) {
      setError('Please enter opponent name');
      return;
    }

    if (gameType === 'BOT' && !selectedStrategy) {
      setError('Please choose a bot strategy');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const payload: CreateGamePayload = {
        board_size: boardSize,
        game_type: gameType,
        variants: selectedVariants
      };

      if (gameType === 'PLAYER') {
        payload.name_of_enemy = trimmedOpponentName;
      }

      if (gameType === 'BOT' && selectedStrategy) {
        payload.strategy = selectedStrategy.name;
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
                aria-label="Play vs Bot"
              />
              <span className="radio-text">
                <strong>Play vs Bot</strong>
                <small>Challenge the Bot</small>
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
                aria-label="Play vs Player"
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

        {gameType === 'BOT' && (
          <fieldset className="form-section">
            <legend>Bot Strategy</legend>
            {loadingOptions ? (
              <p className="strategy-loading">Loading available strategies...</p>
            ) : (
              <div className="form-group">
                {strategies.map((strategy) => (
                  <label className="radio-label" key={strategy.name}>
                    <input
                      type="radio"
                      name="strategy"
                      value={strategy.name}
                      checked={selectedStrategyName === strategy.name}
                      onChange={(e) => setSelectedStrategyName(e.target.value)}
                      disabled={loading}
                      aria-label={strategy.name}
                    />
                    <span className="radio-text radio-text-inline">
                      <strong>{formatGameLabel(strategy.name)}</strong>
                      <span className="difficulty-tag">{formatGameLabel(strategy.difficulty)}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <fieldset className="form-section">
          <legend>Variants</legend>
          <p className="variants-note">Standard rules are always on. You can add one or more extras below.</p>
          {loadingOptions ? (
            <p className="strategy-loading">Loading available variants...</p>
          ) : (
            <div className="variants-grid" aria-label="Game variants">
              {visibleVariants.map((variant) => {
                const checked = selectedVariants.includes(variant.name);

                return (
                  <label className={`variant-card${checked ? ' variant-card--selected' : ''}`} key={variant.name}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleVariant(variant.name)}
                      disabled={loading}
                      aria-label={variant.name}
                    />
                    <span className="variant-card__content">
                      <strong>{variant.name}</strong>
                      <small>{variant.description}</small>
                    </span>
                  </label>
                );
              })}
              {visibleVariants.length === 0 && (
                <p className="strategy-loading">No variants available for selected strategy.</p>
              )}
            </div>
          )}
        </fieldset>

        <div className="form-actions">
          <button
            type="submit"
            disabled={loading || (gameType === 'BOT' && (loadingOptions || strategies.length === 0))}
            className="btn-primary"
          >
            {loading ? 'Creating game...' : 'Start Game'}
          </button>
        </div>

        {error && <div id="new-game-error" className="form-error">{error}</div>}
      </form>
    </Panel>
  );
}
