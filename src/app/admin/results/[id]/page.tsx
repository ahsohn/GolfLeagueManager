'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface LineupResult {
  team_id: number;
  team_name: string;
  slot: number;
  golfer_name: string;
  fedex_points: number;
}

export default function ResultsPage() {
  const { id } = useParams();
  const { isCommissioner, isLoading } = useAuth();
  const router = useRouter();

  const [tournamentName, setTournamentName] = useState('');
  const [results, setResults] = useState<LineupResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [teamsWithoutLineups, setTeamsWithoutLineups] = useState<string[]>([]);
  const [applyingCarryover, setApplyingCarryover] = useState(false);
  const [carryoverMessage, setCarryoverMessage] = useState('');

  useEffect(() => {
    if (!isLoading && !isCommissioner) {
      router.push('/');
    }
  }, [isLoading, isCommissioner, router]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/tournaments/${id}`);
    const data = await res.json();

    setTournamentName(data.tournament?.name || '');

    // Track teams without lineups
    const missingTeams: string[] = [];

    // Flatten lineups into result entries
    const flatResults: LineupResult[] = [];
    data.lineups.forEach((team: { team_id: number; team_name: string; lineup: { slot: number; golfer_name: string; fedex_points: number | null }[] }) => {
      if (team.lineup.length === 0) {
        missingTeams.push(team.team_name);
      } else {
        team.lineup.forEach((l) => {
          flatResults.push({
            team_id: team.team_id,
            team_name: team.team_name,
            slot: l.slot,
            golfer_name: l.golfer_name,
            fedex_points: l.fedex_points || 0,
          });
        });
      }
    });

    setTeamsWithoutLineups(missingTeams);
    setResults(flatResults.sort((a, b) =>
      a.team_name.localeCompare(b.team_name) || a.slot - b.slot
    ));
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updatePoints = (teamId: number, slot: number, points: number) => {
    setResults(
      results.map((r) =>
        r.team_id === teamId && r.slot === slot
          ? { ...r, fedex_points: points }
          : r
      )
    );
  };

  const handleApplyCarryover = async () => {
    setApplyingCarryover(true);
    setCarryoverMessage('');

    try {
      const res = await fetch('/api/admin/carryover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: id }),
      });

      const data = await res.json();

      if (res.ok) {
        setCarryoverMessage(data.message);
        // Refresh the data to show the new lineups
        await fetchData();
        // Clear message after 5 seconds
        setTimeout(() => setCarryoverMessage(''), 5000);
      } else {
        setCarryoverMessage(`Error: ${data.error}`);
      }
    } catch {
      setCarryoverMessage('Network error applying carryover');
    }

    setApplyingCarryover(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/admin/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournament_id: id,
        results: results.map((r) => ({
          team_id: r.team_id,
          slot: r.slot,
          fedex_points: r.fedex_points,
        })),
      }),
    });
    setSaving(false);
    setSuccess('Results saved!');
    setTimeout(() => setSuccess(''), 3000);
  };

  // Group results by team
  const resultsByTeam = results.reduce((acc, r) => {
    if (!acc[r.team_name]) {
      acc[r.team_name] = [];
    }
    acc[r.team_name].push(r);
    return acc;
  }, {} as Record<string, LineupResult[]>);

  if (isLoading || !isCommissioner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-masters-green to-masters-fairway mb-4 animate-pulse">
            <span className="text-3xl">⛳</span>
          </div>
          <p className="text-charcoal-light font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <Link href="/admin" className="header-title hover:opacity-80 transition-opacity">
            Fantasy Golf League
          </Link>
          <span className="badge badge-gold">Commissioner</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
        {/* Page Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center text-sm text-masters-green hover:text-masters-fairway mb-4 transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Admin
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-charcoal mb-1">
                Enter Results
              </h2>
              <p className="text-lg text-charcoal-light">
                {tournamentName || 'Loading...'}
              </p>
            </div>
            {success && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 border border-green-200">
                <span className="text-green-500">✓</span>
                <span className="text-green-600 font-medium">{success}</span>
              </div>
            )}
          </div>
        </div>

        {/* Missing Lineups Warning */}
        {teamsWithoutLineups.length > 0 && (
          <div className="card mb-6 border-2 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-amber-800 mb-1">
                  {teamsWithoutLineups.length} team{teamsWithoutLineups.length > 1 ? 's' : ''} missing lineups
                </h4>
                <p className="text-sm text-amber-700 mb-3">
                  {teamsWithoutLineups.join(', ')}
                </p>
                <button
                  onClick={handleApplyCarryover}
                  disabled={applyingCarryover}
                  className="btn btn-secondary text-sm py-2 px-4 bg-white border-amber-300 hover:bg-amber-100"
                >
                  {applyingCarryover ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Applying...
                    </span>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Apply Carryover (use previous lineups)
                    </>
                  )}
                </button>
                {carryoverMessage && (
                  <p className={`text-sm mt-2 ${carryoverMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                    {carryoverMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results by Team */}
        <div className="space-y-6 mb-8">
          {Object.entries(resultsByTeam).map(([teamName, teamResults], teamIndex) => (
            <div
              key={teamName}
              className="card"
              style={{ animationDelay: `${teamIndex * 50}ms` }}
            >
              <h3 className="font-display text-lg font-semibold text-charcoal mb-4 pb-3 border-b border-cream-dark">
                {teamName}
              </h3>
              <div className="space-y-3">
                {teamResults.map((r) => (
                  <div
                    key={`${r.team_id}-${r.slot}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-cream/50 hover:bg-cream transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-masters-green/10 text-masters-green text-sm font-semibold flex items-center justify-center">
                        {teamResults.indexOf(r) + 1}
                      </span>
                      <span className="font-medium text-charcoal">{r.golfer_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={r.fedex_points}
                        onChange={(e) =>
                          updatePoints(r.team_id, r.slot, parseInt(e.target.value) || 0)
                        }
                        className="w-24 px-3 py-2 rounded-lg border-2 border-cream-dark text-right font-semibold text-masters-green focus:border-masters-green focus:outline-none transition-colors"
                      />
                      <span className="text-sm text-charcoal-light">pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {results.length === 0 && (
          <div className="card text-center py-12">
            <span className="text-6xl opacity-20 mb-4 block">📋</span>
            <p className="text-charcoal-light text-lg">No lineups to enter results for</p>
          </div>
        )}

        {/* Save Button */}
        {results.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary w-full py-4 text-lg"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Results
              </>
            )}
          </button>
        )}
      </main>
    </div>
  );
}
