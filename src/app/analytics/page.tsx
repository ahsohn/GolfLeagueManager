'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import TopSlotsTable from '@/components/TopSlotsTable';
import type { TopSlotsResponse } from '@/app/api/analytics/top-slots/route';

export default function AnalyticsPage() {
  const { team, isLoading, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<TopSlotsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && !team) {
      router.push('/login');
    }
  }, [isLoading, team, router]);

  useEffect(() => {
    if (!team) return;
    fetch('/api/analytics/top-slots')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load');
        return r.json();
      })
      .then((json: TopSlotsResponse) => setData(json))
      .catch(() => setError('Failed to load analytics'));
  }, [team]);

  if (isLoading || !team) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <p className="text-charcoal-light">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="header">
        <div className="header-content">
          <h1 className="header-title">Analytics</h1>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-white/90 hover:text-white text-sm">
              ← Home
            </Link>
            <div className="flex items-center gap-2 bg-white/10 rounded-full pl-4 pr-2 py-1">
              <span className="text-white/90 font-medium">{team.team_name}</span>
              <button
                onClick={logout}
                className="text-white/90 hover:text-white hover:bg-white/10 px-3 py-1 rounded-full text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
        <div className="card">
          <div className="mb-6">
            <h2 className="font-display text-xl font-bold text-charcoal">Top 20 Slots</h2>
            <p className="text-sm text-charcoal-light">Slots with the most total fantasy points this season.</p>
          </div>

          {error ? (
            <p className="text-red-600 text-center py-8">{error}</p>
          ) : data === null ? (
            <p className="text-charcoal-light text-center py-8">Loading...</p>
          ) : (
            <TopSlotsTable slots={data.slots} maxPoints={data.max_points} />
          )}
        </div>
      </main>
    </div>
  );
}
