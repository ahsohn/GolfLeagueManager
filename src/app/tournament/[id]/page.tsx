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

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <Link href="/" className="header-title hover:opacity-80 transition-opacity">
            Fantasy Golf League
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
        {tournament && (
          <>
            {/* Tournament Header */}
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

              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-3xl font-bold text-charcoal mb-2">
                    {tournament.name}
                  </h2>
                </div>
                <span className={`badge ${tournament.status === 'open' ? 'badge-open' : 'badge-locked'}`}>
                  {tournament.status === 'open' ? 'Open' : tournament.status === 'locked' ? 'Locked' : 'Completed'}
                </span>
              </div>
            </div>

            {/* Team Lineups Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {lineups.map((team, index) => (
                <div
                  key={team.team_id}
                  className="card relative overflow-hidden"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Rank indicator for top 3 */}
                  {index < 3 && (
                    <div className="absolute top-0 right-0 w-12 h-12 overflow-hidden">
                      <div className={`absolute transform rotate-45 text-center text-white text-xs font-bold py-1 w-16 -right-4 top-2 ${
                        index === 0 ? 'bg-gold' : index === 1 ? 'bg-gray-400' : 'bg-bronze'
                      }`}>
                        {index === 0 ? '1st' : index === 1 ? '2nd' : '3rd'}
                      </div>
                    </div>
                  )}

                  {/* Team Header */}
                  <div className="flex justify-between items-center mb-4 pb-3 border-b border-cream-dark">
                    <h3 className="font-display text-lg font-semibold text-charcoal">
                      {team.team_name}
                    </h3>
                    <span className="points-display points-display-large">
                      {team.total_points}
                      <span className="text-sm font-normal text-charcoal-light/50 ml-1">pts</span>
                    </span>
                  </div>

                  {/* Lineup List */}
                  {team.lineup.length > 0 ? (
                    <ul className="space-y-2">
                      {team.lineup.map((l) => (
                        <li
                          key={l.slot}
                          className="flex justify-between items-center py-2 px-3 rounded-lg bg-cream/50 hover:bg-cream transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-masters-green/10 text-masters-green text-xs font-semibold flex items-center justify-center">
                              {team.lineup.indexOf(l) + 1}
                            </span>
                            <span className="font-medium text-charcoal">
                              {l.golfer_name}
                            </span>
                          </div>
                          <span className={`font-semibold ${
                            l.fedex_points !== null && l.fedex_points > 0
                              ? 'text-masters-green'
                              : 'text-charcoal-light/40'
                          }`}>
                            {l.fedex_points !== null ? `${l.fedex_points} pts` : '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center py-6">
                      <span className="text-4xl opacity-20 mb-2 block">🏌️</span>
                      <p className="text-charcoal-light/50 italic">No lineup submitted</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Empty state */}
            {lineups.length === 0 && (
              <div className="text-center py-12">
                <span className="text-6xl opacity-20 mb-4 block">🏌️</span>
                <p className="text-charcoal-light/50 text-lg">No lineups submitted yet</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
