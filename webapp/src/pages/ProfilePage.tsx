import { useEffect, useMemo, useState } from 'react';
import { getUserProfile } from '../api/usersApi';
import { Panel } from '../components/ui/Panel';
import { useAuth } from '../hooks/useAuth';
import type { UserProfile } from '../types/users';
import { formatGameLabel } from '../utils/gameLabels';
import './ProfilePage.css';

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
}

function percent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 100);
}

function getWinRateTone(winRate: number): 'profile-kpi--rate-low' | 'profile-kpi--rate-mid' | 'profile-kpi--rate-high' {
  if (winRate >= 70) return 'profile-kpi--rate-high';
  if (winRate >= 40) return 'profile-kpi--rate-mid';
  return 'profile-kpi--rate-low';
}

export function ProfilePage() {
  const { userId } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;

    async function loadProfile() {
      if (!userId) {
        if (alive) {
          setError('Missing user id in session. Please sign in again.');
          setLoading(false);
        }
        return;
      }

      if (alive) {
        setError(null);
        setLoading(true);
      }

      try {
        const nextProfile = await getUserProfile(userId);
        if (alive) {
          setProfile(nextProfile);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : 'Failed to load profile');
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    void loadProfile();
    return () => {
      alive = false;
    };
  }, [userId, reloadKey]);

  const derived = useMemo(() => {
    if (!profile) {
      return null;
    }

    const stats = profile.statistics;
    const totalGames = stats.total_games;
    const totalWins = stats.total_wins;
    const totalLosses = stats.total_losses;
    const totalDraws = stats.total_draws;

    const playerCategoryBase = {
      label: 'Vs player',
      wins: stats.vs_player.wins,
      losses: stats.vs_player.losses,
      draws: stats.vs_player.draws
    };

    const playerGames = playerCategoryBase.wins + playerCategoryBase.losses + playerCategoryBase.draws;
    const playerCategory = {
      ...playerCategoryBase,
      games: playerGames,
      winRate: percent(playerCategoryBase.wins, playerGames),
      lossRate: percent(playerCategoryBase.losses, playerGames),
      drawRate: percent(playerCategoryBase.draws, playerGames),
      tone: getWinRateTone(percent(playerCategoryBase.wins, playerGames))
    };

    const botCategories: Array<{
      label: string;
      difficulty: string;
      wins: number;
      losses: number;
      draws: number;
      games: number;
      winRate: number;
      lossRate: number;
      drawRate: number;
      tone: 'profile-kpi--rate-low' | 'profile-kpi--rate-mid' | 'profile-kpi--rate-high';
    }> = stats.vs_bot.map((item) => {
      const wins = item.wins;
      const losses = item.losses;
      const draws = item.draws;
      const games = wins + losses + draws;
      const winRate = percent(wins, games);
      const lossRate = percent(losses, games);
      const drawRate = percent(draws, games);

      return {
        label: formatGameLabel(item.name),
        difficulty: formatGameLabel(item.difficulty),
        wins,
        losses,
        draws,
        games,
        winRate,
        lossRate,
        drawRate,
        tone: getWinRateTone(winRate)
      };
    });

    return {
      totalGames,
      totalWins,
      totalLosses,
      totalDraws,
      completedGames: totalWins + totalLosses + totalDraws,
      overallWinRate: percent(totalWins, totalGames),
      playerCategory,
      botCategories
    };
  }, [profile]);

  return (
    <Panel title="Profile">
      {loading && <p>Loading profile...</p>}
      {!loading && error && (
        <div className="profile-error-wrap">
          <p className="profile-error">{error}</p>
          <button type="button" className="profile-retry" onClick={() => setReloadKey((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && profile && derived && (
        <div className="profile-dashboard">
          <section className="profile-user-card">
            <h2>{profile.username}</h2>
            <p className="profile-meta">Member since {formatDate(profile.created_at)}</p>
          </section>

          <section className="profile-kpis">
            <article className="profile-kpi"><span>Total games</span><strong>{derived.totalGames}</strong></article>
            <article className="profile-kpi profile-kpi--wins"><span>Total wins</span><strong>{derived.totalWins}</strong></article>
            <article className="profile-kpi profile-kpi--draws"><span>Total draws</span><strong>{derived.totalDraws}</strong></article>
            <article className="profile-kpi profile-kpi--losses"><span>Total losses</span><strong>{derived.totalLosses}</strong></article>
            <article className={`profile-kpi ${getWinRateTone(derived.overallWinRate)}`}><span>Win rate</span><strong>{derived.overallWinRate}%</strong></article>
          </section>

          <section className="profile-block profile-block--full">
            <h3>Overall</h3>
            <div
              className="profile-dual-bar"
              role="img"
              aria-label={`Overall result split: ${derived.totalWins} wins, ${derived.totalDraws} draws and ${derived.totalLosses} losses`}
            >
              <div className="profile-dual-bar__wins" style={{ width: `${percent(derived.totalWins, derived.completedGames)}%` }}>
                W {derived.totalWins}
              </div>
              <div className="profile-dual-bar__draws" style={{ width: `${percent(derived.totalDraws, derived.completedGames)}%` }}>
                D {derived.totalDraws}
              </div>
              <div className="profile-dual-bar__losses" style={{ width: `${percent(derived.totalLosses, derived.completedGames)}%` }}>
                L {derived.totalLosses}
              </div>
            </div>
            {derived.completedGames === 0 && (
              <p className="profile-note">No finished games yet. Start a game to build your chart.</p>
            )}
          </section>

          <section className="profile-block profile-block--full">
            <h3>Category performance</h3>
            <div className="profile-category-split">
              <div className="profile-category-group">
                <p className="profile-category-label">Vs player</p>
                <article className="profile-category-card profile-category-card--player" key={derived.playerCategory.label}>
                  <div className="profile-category-head">
                    <h4>{derived.playerCategory.label}</h4>
                    <span>{derived.playerCategory.games} games</span>
                  </div>
                  <div className="profile-meter" role="img" aria-label={`${derived.playerCategory.label} win rate ${derived.playerCategory.winRate} percent`}>
                    <div className={`profile-meter__wins ${derived.playerCategory.tone}`} style={{ width: `${derived.playerCategory.winRate}%` }} />
                    <div className="profile-meter__draws" style={{ width: `${derived.playerCategory.drawRate}%` }} />
                    <div className="profile-meter__losses" style={{ width: `${derived.playerCategory.lossRate}%` }} />
                  </div>
                  <p className="profile-meter-caption">
                    Win rate {derived.playerCategory.winRate}% | W {derived.playerCategory.wins} / D {derived.playerCategory.draws} / L {derived.playerCategory.losses}
                  </p>
                </article>
              </div>

              <div className="profile-category-divider" aria-hidden="true" />

              <div className="profile-category-group">
                <p className="profile-category-label">Vs bot</p>
                <div className="profile-category-grid">
                  {derived.botCategories.map((category) => (
                    <article className="profile-category-card" key={`${category.label}-${category.difficulty}`}>
                      <div className="profile-category-head">
                        <h4>{category.label}</h4>
                        <span>{category.games} games</span>
                      </div>
                      <p className="profile-category-subtitle">Difficulty: {category.difficulty}</p>
                      <div className="profile-meter" role="img" aria-label={`${category.label} win rate ${category.winRate} percent`}>
                        <div className={`profile-meter__wins ${category.tone}`} style={{ width: `${category.winRate}%` }} />
                        <div className="profile-meter__draws" style={{ width: `${category.drawRate}%` }} />
                        <div className="profile-meter__losses" style={{ width: `${category.lossRate}%` }} />
                      </div>
                      <p className="profile-meter-caption">
                        Win rate {category.winRate}% | W {category.wins} / D {category.draws} / L {category.losses}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </Panel>
  );
}
