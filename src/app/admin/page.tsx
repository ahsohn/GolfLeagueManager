'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Tournament } from '@/types';

export default function AdminPage() {
  const { team, isCommissioner, isLoading } = useAuth();
  const router = useRouter();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [newTournament, setNewTournament] = useState({
    tournament_id: '',
    name: '',
    deadline: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && (!team || !isCommissioner)) {
      router.push('/');
    }
  }, [isLoading, team, isCommissioner, router]);

  useEffect(() => {
    fetch('/api/tournaments')
      .then((r) => r.json())
      .then(setTournaments);
  }, []);

  const createTournament = async () => {
    setSaving(true);
    await fetch('/api/admin/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', ...newTournament }),
    });
    setNewTournament({ tournament_id: '', name: '', deadline: '' });
    const res = await fetch('/api/tournaments');
    setTournaments(await res.json());
    setSaving(false);
  };

  const lockTournament = async (id: string) => {
    await fetch('/api/admin/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update', tournament_id: id, status: 'locked' }),
    });
    const res = await fetch('/api/tournaments');
    setTournaments(await res.json());
  };

  if (isLoading || !isCommissioner) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-green-700 text-white p-4">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="text-xl font-bold">
            Fantasy Golf League - Admin
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="font-semibold mb-4">Create Tournament</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <input
              placeholder="ID (e.g., T001)"
              value={newTournament.tournament_id}
              onChange={(e) =>
                setNewTournament({ ...newTournament, tournament_id: e.target.value })
              }
              className="p-2 border rounded"
            />
            <input
              placeholder="Name"
              value={newTournament.name}
              onChange={(e) =>
                setNewTournament({ ...newTournament, name: e.target.value })
              }
              className="p-2 border rounded"
            />
            <input
              type="datetime-local"
              value={newTournament.deadline}
              onChange={(e) =>
                setNewTournament({ ...newTournament, deadline: e.target.value })
              }
              className="p-2 border rounded"
            />
          </div>
          <button
            onClick={createTournament}
            disabled={saving}
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Tournament'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold mb-4">Tournaments</h2>
          <div className="space-y-2">
            {tournaments.map((t) => (
              <div
                key={t.tournament_id}
                className="flex justify-between items-center p-2 border rounded"
              >
                <div>
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    ({t.status})
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/results/${t.tournament_id}`}
                    className="text-blue-600 hover:underline"
                  >
                    Enter Results
                  </Link>
                  {t.status === 'open' && (
                    <button
                      onClick={() => lockTournament(t.tournament_id)}
                      className="text-red-600 hover:underline"
                    >
                      Lock
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
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
