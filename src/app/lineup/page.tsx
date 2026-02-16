'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Tournament } from '@/types';

interface RosterPlayer {
  slot: number;
  golfer_id: number;
  golfer_name: string;
  times_used: number;
  isSelected: boolean;
  isDefault: boolean;
  canSelect: boolean;
}

function LineupContent() {
  const { team, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tournamentId = searchParams.get('tournament');

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isLoading && !team) {
      router.push('/login');
    }
  }, [isLoading, team, router]);

  useEffect(() => {
    if (team) {
      const fetchData = async () => {
        let tid = tournamentId;
        if (!tid) {
          const res = await fetch('/api/tournaments');
          const tournaments: Tournament[] = await res.json();
          const open = tournaments.find((t) => t.status === 'open');
          tid = open?.tournament_id || tournaments[0]?.tournament_id;
        }

        if (tid) {
          const res = await fetch(
            `/api/lineup?teamId=${team.team_id}&tournamentId=${tid}`
          );
          const data = await res.json();
          setTournament(data.tournament);
          setRoster(data.roster);
          setIsLocked(data.isLocked);

          if (data.currentLineup.length > 0) {
            setSelected(data.currentLineup.map((l: { slot: number }) => l.slot));
          } else {
            setSelected(
              data.roster
                .filter((r: RosterPlayer) => r.isDefault)
                .map((r: RosterPlayer) => r.slot)
            );
          }
        }
      };
      fetchData();
    }
  }, [team, tournamentId]);

  const togglePlayer = (slot: number) => {
    if (isLocked) return;

    const player = roster.find((r) => r.slot === slot);
    if (!player?.canSelect) return;

    if (selected.includes(slot)) {
      setSelected(selected.filter((s) => s !== slot));
    } else if (selected.length < 4) {
      setSelected([...selected, slot]);
    }
  };

  const handleSubmit = async () => {
    if (selected.length !== 4) {
      setError('You must select exactly 4 golfers');
      return;
    }

    setSaving(true);
    setError('');

    const res = await fetch('/api/lineup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: team!.team_id,
        tournamentId: tournament!.tournament_id,
        slots: selected,
      }),
    });

    const data = await res.json();

    if (data.success) {
      setSuccess('Lineup saved!');
    } else {
      setError(data.error || 'Failed to save lineup');
    }

    setSaving(false);
  };

  const getSlotCounterClass = (timesUsed: number) => {
    if (timesUsed >= 7) return 'slot-counter slot-counter-danger';
    if (timesUsed >= 5) return 'slot-counter slot-counter-warning';
    return 'slot-counter';
  };

  if (isLoading || !team) {
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
          <Link href="/" className="header-title hover:opacity-80 transition-opacity">
            Fantasy Golf League
          </Link>
          <span className="text-white/90 font-medium">{team.team_name}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
        {tournament && (
          <>
            {/* Tournament Header */}
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

              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-2xl font-bold text-charcoal mb-2">
                    {tournament.name}
                  </h2>
                  <div className="flex items-center gap-2 text-charcoal-light">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Deadline: {new Date(tournament.deadline).toLocaleString()}</span>
                  </div>
                </div>
                {isLocked && (
                  <span className="badge badge-locked">
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Locked
                  </span>
                )}
              </div>
            </div>

            {/* Selection Counter */}
            <div className="card mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-lg font-semibold text-charcoal">
                    Select Your Lineup
                  </h3>
                  <p className="text-sm text-charcoal-light">
                    Choose 4 golfers from your roster
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                          selected.length >= n
                            ? 'bg-masters-green text-white'
                            : 'bg-cream-dark text-charcoal-light/80'
                        }`}
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-charcoal-light mt-1">
                    {selected.length}/4 selected
                  </p>
                </div>
              </div>
            </div>

            {/* Golfer List */}
            <div className="space-y-3 mb-6">
              {roster.map((player, index) => (
                <div
                  key={player.slot}
                  onClick={() => togglePlayer(player.slot)}
                  className={`
                    golfer-card
                    ${selected.includes(player.slot) ? 'golfer-card-selected' : ''}
                    ${!player.canSelect ? 'golfer-card-disabled' : ''}
                  `}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex items-center gap-3">
                    {selected.includes(player.slot) && (
                      <div className="w-6 h-6 rounded-full bg-masters-green text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                        ✓
                      </div>
                    )}
                    <div>
                      <span className="font-medium text-charcoal">
                        {player.golfer_name}
                      </span>
                      {!player.canSelect && (
                        <span className="ml-2 text-sm text-charcoal-light">
                          (max uses reached)
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={getSlotCounterClass(player.times_used)}>
                    {player.times_used}/8 uses
                  </span>
                </div>
              ))}
            </div>

            {/* Messages */}
            {error && (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 mb-4">
                <span className="text-red-500 text-xl">⚠</span>
                <p className="text-red-600">{error}</p>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200 mb-4">
                <span className="text-green-500 text-xl">✓</span>
                <p className="text-green-600">{success}</p>
              </div>
            )}

            {/* Submit Button */}
            {!isLocked && (
              <button
                onClick={handleSubmit}
                disabled={saving || selected.length !== 4}
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
                    Submit Lineup
                  </>
                )}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function LineupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-cream">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-masters-green to-masters-fairway mb-4 animate-pulse">
              <span className="text-3xl">⛳</span>
            </div>
            <p className="text-charcoal-light font-medium">Loading...</p>
          </div>
        </div>
      }
    >
      <LineupContent />
    </Suspense>
  );
}
