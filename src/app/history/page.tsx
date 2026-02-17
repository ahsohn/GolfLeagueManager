'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Tournament } from '@/types';

export default function HistoryPage() {
  const { team, isLoading } = useAuth();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !team) {
      router.push('/login');
    }
  }, [isLoading, team, router]);

  useEffect(() => {
    if (team) {
      fetch('/api/tournaments')
        .then((r) => r.json())
        .then((data: Tournament[]) => {
          // Filter to only show completed tournaments (any status that isn't 'open')
          const pastTournaments = data.filter((t) => t.status !== 'open');
          setTournaments(pastTournaments);
          setLoading(false);
        });
    }
  }, [team]);

  if (isLoading) {
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

  if (!team) {
    return null;
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1 className="header-title">Past Tournament Results</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-masters-green hover:text-masters-fairway mb-6 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Standings
        </Link>

        <div className="card">
          <h2 className="font-display text-xl font-bold text-charcoal mb-6 flex items-center gap-2">
            <span className="text-gold">🏆</span>
            Completed Tournaments
          </h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-masters-green to-masters-fairway mb-4 animate-pulse">
                <span className="text-2xl">⛳</span>
              </div>
              <p className="text-charcoal-light">Loading tournaments...</p>
            </div>
          ) : tournaments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-charcoal-light">No completed tournaments yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tournaments.map((tournament, index) => (
                <Link
                  key={tournament.tournament_id}
                  href={`/tournament/${tournament.tournament_id}`}
                  className="block p-4 bg-cream rounded-lg hover:bg-cream-dark transition-colors group"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-charcoal group-hover:text-masters-green transition-colors">
                        {tournament.name}
                      </h3>
                      <p className="text-sm text-charcoal-light">
                        {new Date(tournament.deadline).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5 text-charcoal-light group-hover:text-masters-green transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
