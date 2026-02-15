'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Tournament } from '@/types';

interface TeamLineup {
  team_id: number;
  team_name: string;
  lineup: {
    slot: number;
    golfer_name: string;
    fedex_points: number | null;
  }[];
  total_points: number;
}

export default function TournamentPage() {
  const { id } = useParams();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [lineups, setLineups] = useState<TeamLineup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetch(`/api/tournaments/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setTournament(data.tournament);
          setLineups(
            data.lineups.sort(
              (a: TeamLineup, b: TeamLineup) => b.total_points - a.total_points
            )
          );
          setLoading(false);
        });
    }
  }, [id]);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-green-700 text-white p-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="text-xl font-bold">
            Fantasy Golf League
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {tournament && (
          <>
            <h2 className="text-xl font-semibold mb-2">{tournament.name}</h2>
            <p className="text-sm text-gray-600 mb-4">
              Status: {tournament.status}
            </p>
          </>
        )}

        <div className="space-y-4">
          {lineups.map((team) => (
            <div key={team.team_id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium">{team.team_name}</h3>
                <span className="font-bold">{team.total_points} pts</span>
              </div>
              {team.lineup.length > 0 ? (
                <ul className="text-sm text-gray-600">
                  {team.lineup.map((l) => (
                    <li key={l.slot} className="flex justify-between">
                      <span>{l.golfer_name}</span>
                      <span>
                        {l.fedex_points !== null ? `${l.fedex_points} pts` : '-'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No lineup submitted</p>
              )}
            </div>
          ))}
        </div>

        <Link
          href="/"
          className="block text-center mt-6 text-gray-600 hover:underline"
        >
          Back to Standings
        </Link>
      </main>
    </div>
  );
}
