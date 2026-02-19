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
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    deadline: '',
    status: '' as 'open' | 'locked' | 'closed' | '',
  });
  const [carryoverStatus, setCarryoverStatus] = useState<{ [key: string]: 'loading' | 'success' | 'error' | null }>({});
  const [carryoverMessage, setCarryoverMessage] = useState<{ [key: string]: string }>({});

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

  const applyCarryover = async (id: string) => {
    setCarryoverStatus((prev) => ({ ...prev, [id]: 'loading' }));
    setCarryoverMessage((prev) => ({ ...prev, [id]: '' }));

    try {
      const res = await fetch('/api/admin/carryover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: id }),
      });

      const data = await res.json();

      if (res.ok) {
        setCarryoverStatus((prev) => ({ ...prev, [id]: 'success' }));
        setCarryoverMessage((prev) => ({ ...prev, [id]: data.message }));
        // Clear success message after 5 seconds
        setTimeout(() => {
          setCarryoverStatus((prev) => ({ ...prev, [id]: null }));
          setCarryoverMessage((prev) => ({ ...prev, [id]: '' }));
        }, 5000);
      } else {
        setCarryoverStatus((prev) => ({ ...prev, [id]: 'error' }));
        setCarryoverMessage((prev) => ({ ...prev, [id]: data.error || 'Failed to apply carryover' }));
      }
    } catch {
      setCarryoverStatus((prev) => ({ ...prev, [id]: 'error' }));
      setCarryoverMessage((prev) => ({ ...prev, [id]: 'Network error' }));
    }
  };

  const openEditModal = (tournament: Tournament) => {
    setEditingTournament(tournament);
    // Format deadline for datetime-local input (YYYY-MM-DDTHH:MM)
    const deadlineDate = new Date(tournament.deadline);
    const formattedDeadline = deadlineDate.toISOString().slice(0, 16);
    setEditForm({
      name: tournament.name,
      deadline: formattedDeadline,
      status: tournament.status,
    });
  };

  const saveEditedTournament = async () => {
    if (!editingTournament) return;
    setSaving(true);
    await fetch('/api/admin/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        tournament_id: editingTournament.tournament_id,
        name: editForm.name,
        deadline: editForm.deadline,
        status: editForm.status,
      }),
    });
    setEditingTournament(null);
    const res = await fetch('/api/tournaments');
    setTournaments(await res.json());
    setSaving(false);
  };

  if (isLoading || !isCommissioner) {
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
          <span className="badge badge-gold">Commissioner</span>
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
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/20 to-gold-light/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-bronze" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-charcoal">
                Admin Panel
              </h2>
              <p className="text-sm text-charcoal-light">
                Manage tournaments and results
              </p>
            </div>
          </div>
        </div>

        {/* Create Tournament Card */}
        <div className="card mb-8">
          <h3 className="font-display text-lg font-semibold text-charcoal mb-4 flex items-center gap-2">
            <span className="text-gold">+</span>
            Create Tournament
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-charcoal-light mb-2 uppercase tracking-wide">
                Tournament ID
              </label>
              <input
                placeholder="e.g., T001"
                value={newTournament.tournament_id}
                onChange={(e) =>
                  setNewTournament({ ...newTournament, tournament_id: e.target.value })
                }
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal-light mb-2 uppercase tracking-wide">
                Name
              </label>
              <input
                placeholder="Tournament name"
                value={newTournament.name}
                onChange={(e) =>
                  setNewTournament({ ...newTournament, name: e.target.value })
                }
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal-light mb-2 uppercase tracking-wide">
                Deadline
              </label>
              <input
                type="datetime-local"
                value={newTournament.deadline}
                onChange={(e) =>
                  setNewTournament({ ...newTournament, deadline: e.target.value })
                }
                className="input"
              />
            </div>
          </div>
          <button
            onClick={createTournament}
            disabled={saving || !newTournament.tournament_id || !newTournament.name || !newTournament.deadline}
            className="btn btn-gold mt-6"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Tournament
              </>
            )}
          </button>
        </div>

        {/* Tournaments List */}
        <div className="card">
          <h3 className="font-display text-lg font-semibold text-charcoal mb-4">
            Tournaments
          </h3>
          <div className="space-y-3">
            {tournaments.map((t, index) => (
              <div
                key={t.tournament_id}
                className="p-4 rounded-lg bg-cream/50 border border-cream-dark hover:border-masters-green/30 transition-colors"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-masters-green/10 text-masters-green flex items-center justify-center font-semibold text-sm">
                    {t.tournament_id}
                  </div>
                  <div>
                    <span className="font-medium text-charcoal block">{t.name}</span>
                    <span className="text-sm text-charcoal-light">
                      {new Date(t.deadline).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge ${t.status === 'open' ? 'badge-open' : t.status === 'closed' ? 'badge-gold' : 'badge-locked'}`}>
                    {t.status}
                  </span>
                  <button
                    onClick={() => openEditModal(t)}
                    className="btn btn-secondary text-sm py-2 px-4"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    Edit
                  </button>
                  <Link
                    href={`/admin/results/${t.tournament_id}`}
                    className="btn btn-secondary text-sm py-2 px-4"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Results
                  </Link>
                  <button
                    onClick={() => applyCarryover(t.tournament_id)}
                    disabled={carryoverStatus[t.tournament_id] === 'loading'}
                    className="btn btn-secondary text-sm py-2 px-4"
                    title="Apply previous lineup to teams that didn't submit"
                  >
                    {carryoverStatus[t.tournament_id] === 'loading' ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Carryover
                      </>
                    )}
                  </button>
                  {t.status === 'open' && (
                    <button
                      onClick={() => lockTournament(t.tournament_id)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Lock
                    </button>
                  )}
                </div>
                </div>
                {carryoverMessage[t.tournament_id] && (
                  <div className={`mt-3 text-sm px-3 py-2 rounded ${
                    carryoverStatus[t.tournament_id] === 'success'
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : carryoverStatus[t.tournament_id] === 'error'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : ''
                  }`}>
                    {carryoverMessage[t.tournament_id]}
                  </div>
                )}
              </div>
            ))}

            {tournaments.length === 0 && (
              <div className="text-center py-8">
                <span className="text-4xl opacity-20 mb-2 block">🏆</span>
                <p className="text-charcoal-light">No tournaments created yet</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Tournament Modal */}
      {editingTournament && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-masters-green to-masters-fairway px-6 py-4">
              <h3 className="font-display text-lg font-semibold text-white">
                Edit Tournament
              </h3>
              <p className="text-white/80 text-sm">{editingTournament.tournament_id}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-charcoal-light mb-2 uppercase tracking-wide">
                  Tournament Name
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal-light mb-2 uppercase tracking-wide">
                  Deadline (Eastern Time)
                </label>
                <input
                  type="datetime-local"
                  value={editForm.deadline}
                  onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                  className="input w-full"
                />
                <p className="text-xs text-charcoal-light mt-1">
                  Lineups will lock at this time (Eastern)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal-light mb-2 uppercase tracking-wide">
                  Status
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'open' | 'locked' | 'closed' })}
                  className="input w-full"
                >
                  <option value="open">Open</option>
                  <option value="locked">Locked</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 bg-cream/50 flex justify-end gap-3">
              <button
                onClick={() => setEditingTournament(null)}
                className="btn btn-secondary py-2 px-4"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={saveEditedTournament}
                disabled={saving || !editForm.name || !editForm.deadline}
                className="btn btn-primary py-2 px-4"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </span>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
