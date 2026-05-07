'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { EspnEventPicker } from '@/components/EspnEventPicker';
import { Tournament } from '@/types';

interface Pending extends Tournament {}

export default function BackfillEventsPage() {
  const { isCommissioner, isLoading } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<Pending[]>([]);
  const [savingId, setSavingId] = useState<string>('');
  const [error, setError] = useState<{ [id: string]: string }>({});
  const [selection, setSelection] = useState<{ [id: string]: { espnEventId: string; season: number } | null }>({});

  useEffect(() => {
    if (!isLoading && !isCommissioner) router.push('/');
  }, [isLoading, isCommissioner, router]);

  const reload = useCallback(async () => {
    const res = await fetch('/api/tournaments');
    const data: Tournament[] = await res.json();
    setPending(data.filter((t) => !t.espn_event_id));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = async (tournament_id: string) => {
    const sel = selection[tournament_id];
    if (!sel) return;
    setSavingId(tournament_id);
    setError((prev) => ({ ...prev, [tournament_id]: '' }));
    try {
      const res = await fetch('/api/admin/tournament-espn-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id, espn_event_id: sel.espnEventId, season: sel.season }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((prev) => ({ ...prev, [tournament_id]: body.error ?? 'Save failed' }));
      } else {
        await reload();
      }
    } catch {
      setError((prev) => ({ ...prev, [tournament_id]: 'Network error' }));
    } finally {
      setSavingId('');
    }
  };

  if (isLoading || !isCommissioner) {
    return <div className="p-8 text-charcoal-light">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="header">
        <div className="header-content">
          <Link href="/admin" className="header-title hover:opacity-80">Fantasy Golf League</Link>
          <span className="badge badge-gold">Commissioner</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Link href="/admin" className="inline-flex items-center text-sm text-masters-green hover:text-masters-fairway mb-4">
          ← Back to Admin
        </Link>
        <h2 className="font-display text-2xl font-bold text-charcoal mb-2">Backfill ESPN Event IDs</h2>
        <p className="text-sm text-charcoal-light mb-6">
          {pending.length === 0
            ? 'All tournaments have an ESPN event mapped.'
            : `${pending.length} tournament${pending.length === 1 ? '' : 's'} missing an ESPN event id.`}
        </p>

        <div className="space-y-4">
          {pending.map((t) => {
            const sel = selection[t.tournament_id];
            return (
              <div key={t.tournament_id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-charcoal">{t.name}</h3>
                    <p className="text-xs text-charcoal-light">
                      ID: {t.tournament_id} · Deadline: {new Date(t.deadline).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <EspnEventPicker
                  defaultSeason={new Date(t.deadline).getFullYear()}
                  currentTournamentName={t.name}
                  onChange={(s) => setSelection((prev) => ({ ...prev, [t.tournament_id]: s }))}
                />
                {error[t.tournament_id] && (
                  <p className="text-sm text-red-600 mt-2">{error[t.tournament_id]}</p>
                )}
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => save(t.tournament_id)}
                    disabled={!sel || savingId === t.tournament_id}
                    className="btn btn-primary text-sm py-2 px-4"
                  >
                    {savingId === t.tournament_id ? 'Saving…' : 'Save mapping'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
