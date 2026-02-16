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

      <main className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
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
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cream-dark to-sand flex items-center justify-center">
              <svg className="w-6 h-6 text-masters-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-charcoal">
                Waivers
              </h2>
              <p className="text-sm text-charcoal-light">
                Swap a rostered golfer for an available one
              </p>
            </div>
          </div>
        </div>

        {/* Selection Summary */}
        {(dropSlot !== null || addId !== null) && (
          <div className="card mb-6 bg-gradient-to-r from-masters-green/5 to-gold/5 border-masters-green/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wider text-charcoal-light mb-1">Dropping</p>
                  <p className="font-semibold text-red-600">
                    {dropSlot !== null ? roster.find(r => r.slot === dropSlot)?.golfer_name : '—'}
                  </p>
                </div>
                <svg className="w-6 h-6 text-charcoal-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wider text-charcoal-light mb-1">Adding</p>
                  <p className="font-semibold text-masters-green">
                    {addId !== null ? available.find(g => g.golfer_id === addId)?.name : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Your Roster */}
          <div className="card">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-cream-dark">
              <h3 className="font-display text-lg font-semibold text-charcoal flex items-center gap-2">
                <span className="text-red-400">↓</span>
                Your Roster
              </h3>
              <span className="text-sm text-charcoal-light">Select to drop</span>
            </div>
            <div className="space-y-2">
              {roster.map((r, index) => (
                <div
                  key={r.slot}
                  onClick={() => setDropSlot(dropSlot === r.slot ? null : r.slot)}
                  className={`
                    p-3 rounded-lg border-2 cursor-pointer transition-all flex justify-between items-center
                    ${dropSlot === r.slot
                      ? 'bg-red-50 border-red-400 shadow-sm'
                      : 'border-cream-dark hover:border-red-200 hover:bg-red-50/30'
                    }
                  `}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-cream-dark text-charcoal-light text-sm font-semibold flex items-center justify-center">
                      {r.slot}
                    </span>
                    <span className="font-medium text-charcoal">{r.golfer_name}</span>
                  </div>
                  <span className={getSlotCounterClass(r.times_used)}>
                    {r.times_used}/8
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Available Players */}
          <div className="card">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-cream-dark">
              <h3 className="font-display text-lg font-semibold text-charcoal flex items-center gap-2">
                <span className="text-masters-green">↑</span>
                Available
              </h3>
              <span className="text-sm text-charcoal-light">Select to add</span>
            </div>
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-2">
              {available.length > 0 ? (
                available.map((g, index) => (
                  <div
                    key={g.golfer_id}
                    onClick={() => setAddId(addId === g.golfer_id ? null : g.golfer_id)}
                    className={`
                      p-3 rounded-lg border-2 cursor-pointer transition-all
                      ${addId === g.golfer_id
                        ? 'bg-green-50 border-masters-green shadow-sm'
                        : 'border-cream-dark hover:border-masters-green/50 hover:bg-green-50/30'
                      }
                    `}
                    style={{ animationDelay: `${index * 20}ms` }}
                  >
                    <span className="font-medium text-charcoal">{g.name}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <span className="text-4xl opacity-20 mb-2 block">🏌️</span>
                  <p className="text-charcoal-light italic">No available golfers</p>
                </div>
              )}
            </div>
          </div>
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
        <button
          onClick={handleSwap}
          disabled={saving || dropSlot === null || !addId}
          className="btn btn-primary w-full py-4 text-lg"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Confirm Swap
            </>
          )}
        </button>
      </main>
    </div>
  );
}
