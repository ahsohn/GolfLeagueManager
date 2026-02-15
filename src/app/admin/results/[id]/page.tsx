'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!isLoading && !isCommissioner) {
      router.push('/');
    }
  }, [isLoading, isCommissioner, router]);

  useEffect(() => {
    if (id) {
      fetch(`/api/tournaments/${id}`)
        .then((r) => r.json())
        .then((data) => {
          setTournamentName(data.tournament?.name || '');
          // Flatten lineups into result entries
          const flatResults: LineupResult[] = [];
          data.lineups.forEach((team: { team_id: number; team_name: string; lineup: { slot: number; golfer_name: string; fedex_points: number | null }[] }) => {
            team.lineup.forEach((l) => {
              flatResults.push({
                team_id: team.team_id,
                team_name: team.team_name,
                slot: l.slot,
                golfer_name: l.golfer_name,
                fedex_points: l.fedex_points || 0,
              });
            });
          });
          setResults(flatResults.sort((a, b) =>
            a.team_name.localeCompare(b.team_name) || a.slot - b.slot
          ));
        });
    }
  }, [id]);

  const updatePoints = (teamId: number, slot: number, points: number) => {
    setResults(
      results.map((r) =>
        r.team_id === teamId && r.slot === slot
          ? { ...r, fedex_points: points }
          : r
      )
    );
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
  };

  if (isLoading || !isCommissioner) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-green-700 text-white p-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/admin" className="text-xl font-bold">
            Admin - Enter Results
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        <h2 className="text-xl font-semibold mb-4">
          {tournamentName || 'Loading...'}
        </h2>

        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Team</th>
                <th className="text-left py-2">Golfer</th>
                <th className="text-right py-2">FedEx Points</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.team_id}-${r.slot}`} className="border-b">
                  <td className="py-2">{r.team_name}</td>
                  <td className="py-2">{r.golfer_name}</td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      value={r.fedex_points}
                      onChange={(e) =>
                        updatePoints(r.team_id, r.slot, parseInt(e.target.value) || 0)
                      }
                      className="w-24 p-1 border rounded text-right"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {success && <p className="text-green-600 mb-4">{success}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Results'}
        </button>

        <Link
          href="/admin"
          className="block text-center mt-4 text-gray-600 hover:underline"
        >
          Back to Admin
        </Link>
      </main>
    </div>
  );
}
