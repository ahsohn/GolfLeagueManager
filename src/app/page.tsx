'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Tournament } from '@/types';

interface StandingWithTeam {
  team_id: number;
  team_name: string;
  total_points: number;
}

export default function HomePage() {
  const { team, isCommissioner, isLoading, logout } = useAuth();
  const router = useRouter();
  const [standings, setStandings] = useState<StandingWithTeam[]>([]);
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    if (!isLoading && !team) {
      router.push('/login');
    }
  }, [isLoading, team, router]);

  useEffect(() => {
    if (team) {
      fetch('/api/standings')
        .then((r) => r.json())
        .then(setStandings);

      fetch('/api/tournaments')
        .then((r) => r.json())
        .then((tournaments: Tournament[]) => {
          const open = tournaments.find((t) => t.status === 'open');
          setCurrentTournament(open || tournaments[0]);
        });
    }
  }, [team]);

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!team) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-green-700 text-white p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Fantasy Golf League</h1>
          <div className="flex items-center gap-4">
            <span>{team.team_name}</span>
            <button
              onClick={logout}
              className="text-sm underline hover:no-underline"
            >
              Not you?
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {currentTournament && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="font-semibold mb-2">Current Tournament</h2>
            <p className="text-lg">{currentTournament.name}</p>
            <p className="text-sm text-gray-600">
              Deadline: {new Date(currentTournament.deadline).toLocaleString()}
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                href="/lineup"
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                Set Lineup
              </Link>
              <Link
                href={`/tournament/${currentTournament.tournament_id}`}
                className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
              >
                View All Lineups
              </Link>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="font-semibold mb-4">Standings</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Rank</th>
                <th className="text-left py-2">Team</th>
                <th className="text-right py-2">Points</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr
                  key={s.team_id}
                  className={s.team_id === team.team_id ? 'bg-green-50' : ''}
                >
                  <td className="py-2">{i + 1}</td>
                  <td className="py-2">{s.team_name}</td>
                  <td className="py-2 text-right">{s.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <Link
            href="/waivers"
            className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
          >
            Waivers
          </Link>
          {isCommissioner && (
            <Link
              href="/admin"
              className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
            >
              Admin
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
