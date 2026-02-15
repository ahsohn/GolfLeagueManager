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
      // Get current tournament if not specified
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

          // Set initial selection
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

  if (isLoading || !team) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-green-700 text-white p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-xl font-bold">
            Fantasy Golf League
          </Link>
          <span>{team.team_name}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {tournament && (
          <>
            <h2 className="text-xl font-semibold mb-2">{tournament.name}</h2>
            <p className="text-sm text-gray-600 mb-4">
              Deadline: {new Date(tournament.deadline).toLocaleString()}
              {isLocked && (
                <span className="ml-2 text-red-600 font-medium">LOCKED</span>
              )}
            </p>
          </>
        )}

        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h3 className="font-medium mb-2">
            Select 4 Golfers ({selected.length}/4)
          </h3>

          <div className="space-y-2">
            {roster.map((player) => (
              <div
                key={player.slot}
                onClick={() => togglePlayer(player.slot)}
                className={`p-3 rounded border cursor-pointer flex justify-between ${
                  selected.includes(player.slot)
                    ? 'bg-green-100 border-green-500'
                    : player.canSelect
                    ? 'hover:bg-gray-50'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <span>
                  {player.golfer_name}
                  {!player.canSelect && ' (max uses reached)'}
                </span>
                <span className="text-sm text-gray-500">
                  {player.times_used}/8 uses
                </span>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-red-500 mb-4">{error}</p>}
        {success && <p className="text-green-600 mb-4">{success}</p>}

        {!isLocked && (
          <button
            onClick={handleSubmit}
            disabled={saving || selected.length !== 4}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Submit Lineup'}
          </button>
        )}

        <Link
          href="/"
          className="block text-center mt-4 text-gray-600 hover:underline"
        >
          Back to Standings
        </Link>
      </main>
    </div>
  );
}

export default function LineupPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <LineupContent />
    </Suspense>
  );
}
