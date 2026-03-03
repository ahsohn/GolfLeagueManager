'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface RosterEntry {
  team_id: number;
  slot: number;
  golfer_id: number;
  times_used: number;
  golfer_name: string;
  adjusted_times_used: number;
  in_current_lineup: boolean;
}

interface TeamData {
  team: {
    team_id: number;
    team_name: string;
  };
  roster: RosterEntry[];
  currentTournament: {
    tournament_id: string;
    name: string;
    status: string;
    lineup_scored: boolean;
  } | null;
}

export default function TeamRosterPage() {
  const params = useParams();
  const teamId = params.teamId as string;

  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const res = await fetch(`/api/team/${teamId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Team not found');
          } else {
            throw new Error('Failed to fetch');
          }
          return;
        }
        const teamData = await res.json();
        setData(teamData);
      } catch {
        setError('Failed to load team roster');
      } finally {
        setLoading(false);
      }
    };

    if (teamId) {
      fetchTeam();
    }
  }, [teamId]);

  const getSlotCounterClass = (timesUsed: number) => {
    if (timesUsed >= 7) return 'slot-counter slot-counter-danger';
    if (timesUsed >= 5) return 'slot-counter slot-counter-warning';
    return 'slot-counter';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-masters-green to-masters-fairway mb-4 animate-pulse">
            <span className="text-3xl">&#9971;</span>
          </div>
          <p className="text-charcoal-light font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-cream">
        <header className="header">
          <div className="header-content">
            <Link href="/" className="header-title hover:opacity-80 transition-opacity">
              Fantasy Golf League
            </Link>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-6 py-8">
          <div className="card text-center py-12">
            <span className="text-5xl opacity-20 mb-4 block">&#9971;</span>
            <p className="text-red-600">{error || 'Team not found'}</p>
            <Link href="/" className="text-masters-green hover:text-masters-fairway mt-4 inline-block">
              Back to Standings
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <Link href="/" className="header-title hover:opacity-80 transition-opacity">
            Fantasy Golf League
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
        {/* Page Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-masters-green hover:text-masters-fairway mb-4 transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Standings
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-masters-green to-masters-fairway flex items-center justify-center text-white font-bold text-lg">
              {data.team.team_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-charcoal">
                {data.team.team_name}
              </h2>
              <p className="text-sm text-charcoal-light">
                Team Roster
              </p>
            </div>
          </div>
        </div>

        {/* Current Tournament Info */}
        {data.currentTournament && (
          <div className="card mb-6 bg-gradient-to-r from-masters-green/5 to-gold/5 border-masters-green/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-charcoal-light mb-1">
                  {data.currentTournament.lineup_scored ? 'Current Tournament (Scored)' : 'Current Tournament'}
                </p>
                <p className="font-semibold text-charcoal">{data.currentTournament.name}</p>
              </div>
              <span className={`badge ${data.currentTournament.status === 'open' ? 'badge-open' : 'badge-locked'}`}>
                {data.currentTournament.status === 'open' ? 'Open' : 'Locked'}
              </span>
            </div>
          </div>
        )}

        {/* Roster Table */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-cream-dark">
            <h3 className="font-display text-lg font-semibold text-charcoal">
              Roster
            </h3>
            <span className="text-sm text-charcoal-light">
              Uses shown exclude current tournament
            </span>
          </div>

          <div className="space-y-2">
            {data.roster.map((entry, index) => (
              <div
                key={entry.slot}
                className={`
                  p-3 rounded-lg border-2 flex justify-between items-center transition-all
                  ${entry.in_current_lineup
                    ? 'bg-masters-green/5 border-masters-green/30'
                    : 'border-cream-dark'
                  }
                `}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-cream-dark text-charcoal-light text-sm font-semibold flex items-center justify-center">
                    {entry.slot}
                  </span>
                  <div>
                    <span className="font-medium text-charcoal">{entry.golfer_name}</span>
                    {entry.in_current_lineup && (
                      <span className="ml-2 text-xs bg-masters-green/20 text-masters-green px-2 py-0.5 rounded-full">
                        In Lineup
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getSlotCounterClass(entry.adjusted_times_used)}>
                    {entry.adjusted_times_used}/8
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-cream-dark">
            <p className="text-xs text-charcoal-light mb-2">Legend:</p>
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="slot-counter">0-4/8</span>
                <span className="text-charcoal-light">Plenty of uses left</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="slot-counter slot-counter-warning">5-6/8</span>
                <span className="text-charcoal-light">Getting low</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="slot-counter slot-counter-danger">7+/8</span>
                <span className="text-charcoal-light">Almost exhausted</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
