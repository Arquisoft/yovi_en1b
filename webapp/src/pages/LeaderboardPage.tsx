import { useEffect, useState } from 'react';
import { Panel } from '../components/ui/Panel';
import { getLeaderboard } from '../api/usersApi';
import type { Leaderboard } from '../types/users';
import { formatGameLabel } from '../utils/gameLabels';
import './LeaderboardPage.css';

export function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overall');

  useEffect(() => {
    async function loadLeaderboard() {
      // Keep the view optimistic on refresh by resetting error and loading together.
      try {
        setError(null);
        setLoading(true);
        const data = await getLeaderboard();
        setLeaderboard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();
  }, []);

  // Bot tabs are derived from the payload so the UI automatically follows new strategies.
  const botStrategies = leaderboard ? Object.keys(leaderboard.vs_bots) : [];
  // Normalize the 'overall' tab into a falsy value so the lower render branch stays simple.
  const currentTab = activeTab === 'overall' ? null : activeTab;

  return (
    <Panel title="Leaderboard" subtitle="Top YOVI players">
      {loading && <p className="leaderboard-loading">Loading leaderboard...</p>}

      {!loading && error && (
        <div className="leaderboard-error">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && leaderboard && (
        <div className="leaderboard-container">
          <div className="leaderboard-tabs">
            <button
              className={`leaderboard-tab ${activeTab === 'overall' ? 'leaderboard-tab--active' : ''}`}
              onClick={() => setActiveTab('overall')}
              type="button"
            >
              Overall
            </button>
            {botStrategies.map((strategy) => (
              <button
                key={strategy}
                className={`leaderboard-tab ${activeTab === strategy ? 'leaderboard-tab--active' : ''}`}
                onClick={() => setActiveTab(strategy)}
                type="button"
              >
                {/* The tab label uses the display name, not the internal strategy id. */}
                vs {formatGameLabel(strategy)}
              </button>
            ))}
          </div>

          <div className="leaderboard-content">
            {activeTab === 'overall' && (
              <div className="leaderboard-table-wrapper">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th className="leaderboard-rank">Rank</th>
                      <th className="leaderboard-player">Player</th>
                      <th className="leaderboard-wins">Wins</th>
                      <th className="leaderboard-games">Games</th>
                      <th className="leaderboard-winrate">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.overall.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="leaderboard-empty">
                          No games played yet
                        </td>
                      </tr>
                    ) : (
                      leaderboard.overall.map((entry, index) => {
                        // Rank is derived from the array order, so the API can stay compact.
                        const winRate =
                          entry.total_games > 0
                            ? Math.round((entry.total_wins / entry.total_games) * 100)
                            : 0;
                        return (
                          <tr key={entry.username}>
                            <td className="leaderboard-rank">{index + 1}</td>
                            <td className="leaderboard-player">{entry.username}</td>
                            <td className="leaderboard-wins">{entry.total_wins}</td>
                            <td className="leaderboard-games">{entry.total_games}</td>
                            <td className="leaderboard-winrate">{winRate}%</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {currentTab && leaderboard.vs_bots[currentTab] && (
              <div className="leaderboard-table-wrapper">
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th className="leaderboard-rank">Rank</th>
                      <th className="leaderboard-player">Player</th>
                      <th className="leaderboard-wins">Wins vs {formatGameLabel(currentTab)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.vs_bots[currentTab].length === 0 ? (
                      <tr>
                        <td colSpan={3} className="leaderboard-empty">
                          No games against this bot yet
                        </td>
                      </tr>
                    ) : (
                      // The bot-specific table is intentionally smaller because it only tracks wins.
                      leaderboard.vs_bots[currentTab].map((entry, index) => (
                        <tr key={entry.username}>
                          <td className="leaderboard-rank">{index + 1}</td>
                          <td className="leaderboard-player">{entry.username}</td>
                          <td className="leaderboard-wins">{entry.wins}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

