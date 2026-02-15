'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Golfer, RosterWithGolfers } from '@/types';

export default function WaiversPage() {
  const { team, isLoading } = useAuth();
  const router = useRouter();

  const [roster, setRoster] = useState<RosterWithGolfers[]>([]);
  const [available, setAvailable] = useState<Golfer[]>([]);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [addId, setAddId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isLoading && !team) {
      router.push('/login');
    }
  }, [isLoading, team, router]);

  const fetchData = async () => {
    if (team) {
      const [rosterRes, availableRes] = await Promise.all([
        fetch(`/api/roster/${team.team_id}`),
        fetch('/api/waivers/available'),
      ]);
      setRoster(await rosterRes.json());
      setAvailable(await availableRes.json());
    }
  };

  useEffect(() => {
    fetchData();
  }, [team]);

  const handleSwap = async () => {
    if (dropSlot === null || !addId) {
      setError('Select a player to drop and a player to add');
      return;
    }

    const dropEntry = roster.find((r) => r.slot === dropSlot);
    if (!dropEntry) {
      setError('Invalid selection');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const res = await fetch('/api/waivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: team!.team_id,
        dropGolferId: dropEntry.golfer_id,
        addGolferId: addId,
        slot: dropSlot,
      }),
    });

    const data = await res.json();

    if (data.success) {
      setSuccess('Waiver processed!');
      setDropSlot(null);
      setAddId(null);
      fetchData();
    } else {
      setError(data.error || 'Waiver failed');
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
        <h2 className="text-xl font-semibold mb-4">Waivers</h2>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium mb-2">Your Roster (select to drop)</h3>
            <div className="space-y-2">
              {roster.map((r) => (
                <div
                  key={r.slot}
                  onClick={() => setDropSlot(r.slot)}
                  className={`p-2 rounded border cursor-pointer ${
                    dropSlot === r.slot
                      ? 'bg-red-100 border-red-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium">Slot {r.slot}:</span> {r.golfer_name} ({r.times_used}/8)
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-medium mb-2">Available (select to add)</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {available.map((g) => (
                <div
                  key={g.golfer_id}
                  onClick={() => setAddId(g.golfer_id)}
                  className={`p-2 rounded border cursor-pointer ${
                    addId === g.golfer_id
                      ? 'bg-green-100 border-green-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {g.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-red-500 mb-4">{error}</p>}
        {success && <p className="text-green-600 mb-4">{success}</p>}

        <button
          onClick={handleSwap}
          disabled={saving || dropSlot === null || !addId}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? 'Processing...' : 'Confirm Swap'}
        </button>

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
