'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface WaiverHistoryEntry {
  id: number;
  timestamp: string;
  team_id: number;
  team_name: string;
  dropped_golfer: string;
  added_golfer: string;
  slot: number;
}

export default function WaiverHistoryPage() {
  const [history, setHistory] = useState<WaiverHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/waivers/history');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setHistory(data);
      } catch {
        setError('Failed to load waiver history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Group transactions by date
  const groupedByDate = history.reduce((acc, entry) => {
    const dateKey = formatDate(entry.timestamp);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(entry);
    return acc;
  }, {} as Record<string, WaiverHistoryEntry[]>);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-masters-green to-masters-fairway mb-4 animate-pulse">
            <span className="text-3xl">&#9971;</span>
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
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 animate-fade-in">
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-charcoal">
                Waiver History
              </h2>
              <p className="text-sm text-charcoal-light">
                All waiver transactions this season
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 mb-4">
            <span className="text-red-500 text-xl">!</span>
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {history.length === 0 ? (
          <div className="card text-center py-12">
            <span className="text-5xl opacity-20 mb-4 block">&#9971;</span>
            <p className="text-charcoal-light italic">No waiver transactions yet</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByDate).map(([dateKey, entries]) => (
              <div key={dateKey}>
                <h3 className="text-sm font-semibold text-charcoal-light uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-masters-green"></span>
                  {dateKey}
                </h3>
                <div className="card">
                  <div className="space-y-4">
                    {entries.map((entry, index) => (
                      <div
                        key={entry.id}
                        className={`
                          flex items-center gap-4 pb-4
                          ${index < entries.length - 1 ? 'border-b border-cream-dark' : ''}
                        `}
                      >
                        {/* Time */}
                        <div className="w-16 text-sm text-charcoal-light flex-shrink-0">
                          {formatTime(entry.timestamp)}
                        </div>

                        {/* Team Badge */}
                        <div className="w-24 flex-shrink-0">
                          <span className="inline-block px-2 py-1 text-xs font-semibold bg-cream-dark text-charcoal rounded">
                            {entry.team_name}
                          </span>
                        </div>

                        {/* Transaction */}
                        <div className="flex-1 flex items-center gap-2 text-sm">
                          <span className="text-red-600 font-medium line-through opacity-70">
                            {entry.dropped_golfer}
                          </span>
                          <svg className="w-4 h-4 text-charcoal-light flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                          <span className="text-masters-green font-medium">
                            {entry.added_golfer}
                          </span>
                        </div>

                        {/* Slot */}
                        <div className="flex-shrink-0">
                          <span className="text-xs text-charcoal-light">
                            Slot {entry.slot}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
