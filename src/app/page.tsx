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
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-masters-green to-masters-fairway mb-4 animate-pulse">
            <span className="text-3xl">⛳</span>
          </div>
          <p className="text-charcoal-light/60 font-medium">Loading...</p>
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
          <h1 className="header-title">Fantasy Golf League</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/10 rounded-full pl-4 pr-2 py-1">
              <span className="text-white/90 font-medium">{team.team_name}</span>
              <button
                onClick={logout}
                className="text-white/60 hover:text-white hover:bg-white/10 px-3 py-1 rounded-full text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
        {/* Current Tournament Card */}
        {currentTournament && (
          <div className="tournament-card mb-8">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-masters-green/70 mb-1 block">
                  Current Tournament
                </span>
                <h2 className="font-display text-2xl font-bold text-charcoal">
                  {currentTournament.name}
                </h2>
              </div>
              <span className={`badge ${currentTournament.status === 'open' ? 'badge-open' : 'badge-locked'}`}>
                {currentTournament.status === 'open' ? 'Open' : 'Locked'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-charcoal-light/70 mb-6">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Deadline: {new Date(currentTournament.deadline).toLocaleString()}</span>
            </div>

            <div className="flex gap-3">
              <Link href="/lineup" className="btn btn-primary">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Set Lineup
              </Link>
              <Link href={`/tournament/${currentTournament.tournament_id}`} className="btn btn-secondary">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Lineups
              </Link>
            </div>
          </div>
        )}

        {/* Standings Card */}
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-bold text-charcoal flex items-center gap-2">
              <span className="text-gold">🏆</span>
              League Standings
            </h2>
            <span className="text-sm text-charcoal-light/50">
              {standings.length} Teams
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="standings-table">
              <thead>
                <tr>
                  <th className="w-16">Rank</th>
                  <th>Team</th>
                  <th className="text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => (
                  <tr
                    key={s.team_id}
                    className={`
                      ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : ''}
                      ${s.team_id === team.team_id ? 'my-team' : ''}
                    `}
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <td className="font-semibold text-charcoal-light">
                      {i + 1}
                    </td>
                    <td className="font-medium">
                      {s.team_name}
                      {s.team_id === team.team_id && (
                        <span className="ml-2 text-xs bg-gold/20 text-bronze px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <span className="points-display">{s.total_points.toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/waivers"
            className="card hover:shadow-golf-lg transition-all group cursor-pointer text-center py-6"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cream-dark to-sand mx-auto mb-3 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-masters-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <span className="font-medium text-charcoal">Waivers</span>
          </Link>

          {isCommissioner && (
            <Link
              href="/admin"
              className="card hover:shadow-golf-lg transition-all group cursor-pointer text-center py-6"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/20 to-gold-light/20 mx-auto mb-3 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-bronze" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <span className="font-medium text-charcoal">Admin</span>
              <span className="badge badge-gold text-xs mt-1">Commissioner</span>
            </Link>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-cream-dark mt-12 py-6">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="text-sm text-charcoal-light/40">
            Fantasy Golf League &middot; FedEx Cup Points Tracker
          </p>
        </div>
      </footer>
    </div>
  );
}
