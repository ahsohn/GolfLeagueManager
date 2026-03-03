'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface LineupResult {
  team_id: number;
  team_name: string;
  slot: number;
  golfer_name: string;
  espn_id: string | null;
  fedex_points: number;
}

interface RosterSlot {
  slot: number;
  golfer_name: string;
  times_used: number;
}

interface AdjustmentState {
  isOpen: boolean;
  teamId: number | null;
  teamName: string;
  oldSlot: number | null;
  oldGolferName: string;
  roster: RosterSlot[];
  newSlot: number | null;
  newPoints: number;
  note: string;
  loading: boolean;
  error: string;
}

export default function ResultsPage() {
  const { id } = useParams();
  const { isCommissioner, isLoading, team } = useAuth();
  const router = useRouter();

  const [tournamentName, setTournamentName] = useState('');
  const [results, setResults] = useState<LineupResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [teamsWithoutLineups, setTeamsWithoutLineups] = useState<string[]>([]);
  const [applyingCarryover, setApplyingCarryover] = useState(false);
  const [carryoverMessage, setCarryoverMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lineup adjustment state
  const [adjustment, setAdjustment] = useState<AdjustmentState>({
    isOpen: false,
    teamId: null,
    teamName: '',
    oldSlot: null,
    oldGolferName: '',
    roster: [],
    newSlot: null,
    newPoints: 0,
    note: '',
    loading: false,
    error: '',
  });

  useEffect(() => {
    if (!isLoading && !isCommissioner) {
      router.push('/');
    }
  }, [isLoading, isCommissioner, router]);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/tournaments/${id}`);
    const data = await res.json();

    setTournamentName(data.tournament?.name || '');

    // Track teams without lineups
    const missingTeams: string[] = [];

    // Flatten lineups into result entries
    const flatResults: LineupResult[] = [];
    data.lineups.forEach((team: { team_id: number; team_name: string; lineup: { slot: number; golfer_name: string; espn_id: string | null; fedex_points: number | null }[] }) => {
      if (team.lineup.length === 0) {
        missingTeams.push(team.team_name);
      } else {
        team.lineup.forEach((l) => {
          flatResults.push({
            team_id: team.team_id,
            team_name: team.team_name,
            slot: l.slot,
            golfer_name: l.golfer_name,
            espn_id: l.espn_id,
            fedex_points: l.fedex_points || 0,
          });
        });
      }
    });

    setTeamsWithoutLineups(missingTeams);
    setResults(flatResults.sort((a, b) =>
      a.team_name.localeCompare(b.team_name) || a.slot - b.slot
    ));
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updatePoints = (teamId: number, slot: number, points: number) => {
    setResults(
      results.map((r) =>
        r.team_id === teamId && r.slot === slot
          ? { ...r, fedex_points: points }
          : r
      )
    );
  };

  const handleApplyCarryover = async () => {
    setApplyingCarryover(true);
    setCarryoverMessage('');

    try {
      const res = await fetch('/api/admin/carryover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: id }),
      });

      const data = await res.json();

      if (res.ok) {
        setCarryoverMessage(data.message);
        // Refresh the data to show the new lineups
        await fetchData();
        // Clear message after 5 seconds
        setTimeout(() => setCarryoverMessage(''), 5000);
      } else {
        setCarryoverMessage(`Error: ${data.error}`);
      }
    } catch {
      setCarryoverMessage('Network error applying carryover');
    }

    setApplyingCarryover(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/admin/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournament_id: id,
        results: results.map((r) => ({
          team_id: r.team_id,
          slot: r.slot,
          fedex_points: r.fedex_points,
        })),
      }),
    });
    setSaving(false);
    setSuccess('Results saved!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDownloadCSV = () => {
    const header = 'Team Name,Golfer Name,ESPN ID,FedEx Points';
    const rows = results.map((r) =>
      `"${r.team_name}","${r.golfer_name}","${r.espn_id || ''}",`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (tournamentName || 'tournament').replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `lineups_${safeName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) {
        setUploadError('Could not read file');
        return;
      }

      const lines = text.split('\n').filter((line) => line.trim());
      if (lines.length < 2) {
        setUploadError('CSV must have a header row and at least one data row');
        return;
      }

      // Skip header row
      const dataLines = lines.slice(1);
      const updatedResults = [...results];
      let matchCount = 0;

      for (const line of dataLines) {
        // Parse CSV line handling quoted fields
        const fields = parseCSVLine(line);
        if (fields.length < 4) continue;

        const csvTeamName = fields[0].trim();
        const csvEspnId = fields[2].trim();
        const csvPoints = fields[3].trim();

        if (!csvPoints) continue;

        const points = parseInt(csvPoints, 10);
        if (isNaN(points)) continue;

        // Match by team name + espn_id
        const idx = updatedResults.findIndex(
          (r) => r.team_name === csvTeamName && r.espn_id === csvEspnId
        );

        if (idx !== -1) {
          updatedResults[idx] = { ...updatedResults[idx], fedex_points: points };
          matchCount++;
        }
      }

      if (matchCount === 0) {
        setUploadError('No matching lineups found in CSV. Check team names and ESPN IDs.');
      } else {
        setResults(updatedResults);
        setSuccess(`Loaded ${matchCount} result${matchCount > 1 ? 's' : ''} from CSV`);
        setTimeout(() => setSuccess(''), 3000);
      }
    };
    reader.readAsText(file);

    // Reset file input so the same file can be re-uploaded
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Parse a CSV line respecting quoted fields
  const parseCSVLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current);
    return fields;
  };

  // Open adjustment modal and fetch roster
  const openAdjustmentModal = async (entry: LineupResult) => {
    setAdjustment({
      isOpen: true,
      teamId: entry.team_id,
      teamName: entry.team_name,
      oldSlot: entry.slot,
      oldGolferName: entry.golfer_name,
      roster: [],
      newSlot: null,
      newPoints: 0,
      note: '',
      loading: true,
      error: '',
    });

    try {
      const res = await fetch(`/api/roster/${entry.team_id}`);
      const rosterData = await res.json();
      setAdjustment((prev) => ({
        ...prev,
        roster: rosterData.map((r: { slot: number; golfer_name: string; times_used: number }) => ({
          slot: r.slot,
          golfer_name: r.golfer_name,
          times_used: r.times_used,
        })),
        loading: false,
      }));
    } catch {
      setAdjustment((prev) => ({
        ...prev,
        loading: false,
        error: 'Failed to load roster',
      }));
    }
  };

  const closeAdjustmentModal = () => {
    setAdjustment({
      isOpen: false,
      teamId: null,
      teamName: '',
      oldSlot: null,
      oldGolferName: '',
      roster: [],
      newSlot: null,
      newPoints: 0,
      note: '',
      loading: false,
      error: '',
    });
  };

  const handleAdjustmentSubmit = async () => {
    if (!adjustment.newSlot || !team?.owner_email) {
      setAdjustment((prev) => ({ ...prev, error: 'Please select a replacement slot' }));
      return;
    }

    setAdjustment((prev) => ({ ...prev, loading: true, error: '' }));

    try {
      const res = await fetch('/api/admin/adjust-lineup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: id,
          team_id: adjustment.teamId,
          old_slot: adjustment.oldSlot,
          new_slot: adjustment.newSlot,
          new_points: adjustment.newPoints,
          admin_note: adjustment.note || null,
          admin_email: team.owner_email,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        closeAdjustmentModal();
        await fetchData();
        setSuccess('Lineup adjusted successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setAdjustment((prev) => ({ ...prev, loading: false, error: data.error }));
      }
    } catch {
      setAdjustment((prev) => ({ ...prev, loading: false, error: 'Network error' }));
    }
  };

  // Group results by team
  const resultsByTeam = results.reduce((acc, r) => {
    if (!acc[r.team_name]) {
      acc[r.team_name] = [];
    }
    acc[r.team_name].push(r);
    return acc;
  }, {} as Record<string, LineupResult[]>);

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
          <Link href="/admin" className="header-title hover:opacity-80 transition-opacity">
            Fantasy Golf League
          </Link>
          <span className="badge badge-gold">Commissioner</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 animate-fade-in">
        {/* Page Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center text-sm text-masters-green hover:text-masters-fairway mb-4 transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Admin
          </Link>

          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-charcoal mb-1">
                Enter Results
              </h2>
              <p className="text-lg text-charcoal-light">
                {tournamentName || 'Loading...'}
              </p>
            </div>
            {success && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 border border-green-200">
                <span className="text-green-500">✓</span>
                <span className="text-green-600 font-medium">{success}</span>
              </div>
            )}
          </div>
        </div>

        {/* CSV Download/Upload */}
        {results.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button
              onClick={handleDownloadCSV}
              className="btn btn-secondary text-sm py-2 px-4"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Lineups CSV
            </button>
            <label className="btn btn-secondary text-sm py-2 px-4 cursor-pointer">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Results CSV
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleUploadCSV}
                className="hidden"
              />
            </label>
            {uploadError && (
              <span className="text-sm text-red-600">{uploadError}</span>
            )}
          </div>
        )}

        {/* Missing Lineups Warning */}
        {teamsWithoutLineups.length > 0 && (
          <div className="card mb-6 border-2 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-amber-800 mb-1">
                  {teamsWithoutLineups.length} team{teamsWithoutLineups.length > 1 ? 's' : ''} missing lineups
                </h4>
                <p className="text-sm text-amber-700 mb-3">
                  {teamsWithoutLineups.join(', ')}
                </p>
                <button
                  onClick={handleApplyCarryover}
                  disabled={applyingCarryover}
                  className="btn btn-secondary text-sm py-2 px-4 bg-white border-amber-300 hover:bg-amber-100"
                >
                  {applyingCarryover ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Applying...
                    </span>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Apply Carryover (use previous lineups)
                    </>
                  )}
                </button>
                {carryoverMessage && (
                  <p className={`text-sm mt-2 ${carryoverMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                    {carryoverMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results by Team */}
        <div className="space-y-6 mb-8">
          {Object.entries(resultsByTeam).map(([teamName, teamResults], teamIndex) => (
            <div
              key={teamName}
              className="card"
              style={{ animationDelay: `${teamIndex * 50}ms` }}
            >
              <h3 className="font-display text-lg font-semibold text-charcoal mb-4 pb-3 border-b border-cream-dark">
                {teamName}
              </h3>
              <div className="space-y-3">
                {teamResults.map((r) => (
                  <div
                    key={`${r.team_id}-${r.slot}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-cream/50 hover:bg-cream transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-masters-green/10 text-masters-green text-sm font-semibold flex items-center justify-center">
                        {teamResults.indexOf(r) + 1}
                      </span>
                      <span className="font-medium text-charcoal">{r.golfer_name}</span>
                      <span className="text-xs text-charcoal-light">(Slot {r.slot})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openAdjustmentModal(r)}
                        className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition-colors"
                        title="Adjust lineup"
                      >
                        Adjust
                      </button>
                      <input
                        type="number"
                        value={r.fedex_points}
                        onChange={(e) =>
                          updatePoints(r.team_id, r.slot, parseInt(e.target.value) || 0)
                        }
                        className="w-24 px-3 py-2 rounded-lg border-2 border-cream-dark text-right font-semibold text-masters-green focus:border-masters-green focus:outline-none transition-colors"
                      />
                      <span className="text-sm text-charcoal-light">pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {results.length === 0 && (
          <div className="card text-center py-12">
            <span className="text-6xl opacity-20 mb-4 block">📋</span>
            <p className="text-charcoal-light text-lg">No lineups to enter results for</p>
          </div>
        )}

        {/* Save Button */}
        {results.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary w-full py-4 text-lg"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Results
              </>
            )}
          </button>
        )}

        {/* Adjustment Modal */}
        {adjustment.isOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-cream-dark">
                <h3 className="font-display text-xl font-bold text-charcoal">
                  Adjust Lineup
                </h3>
                <p className="text-sm text-charcoal-light mt-1">
                  {adjustment.teamName}
                </p>
              </div>

              <div className="p-6 space-y-4">
                {/* Current slot info */}
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-800">Removing:</p>
                  <p className="text-red-700">
                    Slot {adjustment.oldSlot}: {adjustment.oldGolferName}
                  </p>
                </div>

                {/* Replacement slot selection */}
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-2">
                    Replace with slot:
                  </label>
                  {adjustment.loading ? (
                    <div className="flex items-center justify-center py-4">
                      <svg className="animate-spin h-6 w-6 text-masters-green" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {adjustment.roster
                        .filter((slot) => slot.slot !== adjustment.oldSlot)
                        .map((slot) => {
                          const isMaxed = slot.times_used >= 8;
                          const isSelected = adjustment.newSlot === slot.slot;
                          return (
                            <button
                              key={slot.slot}
                              onClick={() => !isMaxed && setAdjustment((prev) => ({ ...prev, newSlot: slot.slot }))}
                              disabled={isMaxed}
                              className={`w-full p-3 rounded-lg border-2 text-left transition-colors ${
                                isMaxed
                                  ? 'bg-gray-100 border-gray-200 cursor-not-allowed opacity-60'
                                  : isSelected
                                  ? 'bg-green-50 border-masters-green'
                                  : 'bg-white border-cream-dark hover:border-masters-green/50'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className={`font-medium ${isMaxed ? 'text-gray-500' : 'text-charcoal'}`}>
                                  Slot {slot.slot}: {slot.golfer_name}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded ${
                                  isMaxed
                                    ? 'bg-red-100 text-red-700'
                                    : slot.times_used >= 6
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {slot.times_used}/8 uses
                                </span>
                              </div>
                              {isMaxed && (
                                <p className="text-xs text-red-600 mt-1">Max uses reached</p>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Points input */}
                {adjustment.newSlot && (
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">
                      FedEx Points for new golfer:
                    </label>
                    <input
                      type="number"
                      value={adjustment.newPoints}
                      onChange={(e) => setAdjustment((prev) => ({ ...prev, newPoints: parseInt(e.target.value) || 0 }))}
                      className="w-full px-4 py-2 rounded-lg border-2 border-cream-dark focus:border-masters-green focus:outline-none transition-colors"
                      placeholder="Enter points"
                    />
                  </div>
                )}

                {/* Note input */}
                {adjustment.newSlot && (
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">
                      Note (optional):
                    </label>
                    <input
                      type="text"
                      value={adjustment.note}
                      onChange={(e) => setAdjustment((prev) => ({ ...prev, note: e.target.value }))}
                      className="w-full px-4 py-2 rounded-lg border-2 border-cream-dark focus:border-masters-green focus:outline-none transition-colors"
                      placeholder="e.g., Golfer WD, substituting per league rules"
                    />
                  </div>
                )}

                {/* Error message */}
                {adjustment.error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{adjustment.error}</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-cream-dark flex gap-3">
                <button
                  onClick={closeAdjustmentModal}
                  className="flex-1 px-4 py-2 rounded-lg border-2 border-cream-dark text-charcoal hover:bg-cream transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjustmentSubmit}
                  disabled={!adjustment.newSlot || adjustment.loading}
                  className="flex-1 px-4 py-2 rounded-lg bg-masters-green text-white font-medium hover:bg-masters-fairway transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adjustment.loading ? 'Saving...' : 'Confirm Adjustment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
