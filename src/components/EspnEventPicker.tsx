'use client';

import { useEffect, useState } from 'react';

interface ScheduleEvent {
  eventId: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface ScheduleResponse {
  season: number;
  events: ScheduleEvent[];
}

export interface EspnEventPickerProps {
  defaultSeason?: number;
  currentTournamentName?: string;
  onChange: (selection: { espnEventId: string; season: number; eventName: string } | null) => void;
}

function similarityScore(name: string, target: string): number {
  if (!target) return 0;
  const a = name.toLowerCase();
  const b = target.toLowerCase();
  if (a === b) return 1000;
  if (a.includes(b) || b.includes(a)) return 500;
  // Cheap token-overlap score; good enough for one-off picks.
  const aTokens = new Set(a.split(/\s+/));
  const bTokens = b.split(/\s+/);
  let overlap = 0;
  for (const t of bTokens) if (aTokens.has(t)) overlap += 1;
  return overlap;
}

export function EspnEventPicker({ defaultSeason, currentTournamentName, onChange }: EspnEventPickerProps) {
  const currentYear = new Date().getFullYear();
  const [season, setSeason] = useState<number>(defaultSeason ?? currentYear);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/admin/espn-schedule?season=${season}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Failed to load schedule');
        return r.json();
      })
      .then((data: ScheduleResponse) => {
        if (cancelled) return;
        const sorted = currentTournamentName
          ? [...data.events].sort((a, b) => similarityScore(b.name, currentTournamentName) - similarityScore(a.name, currentTournamentName))
          : data.events;
        setEvents(sorted);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [season, currentTournamentName]);

  const handleSelect = (eventId: string) => {
    setSelectedId(eventId);
    if (!eventId) {
      onChange(null);
      return;
    }
    const event = events.find((e) => e.eventId === eventId);
    if (event) onChange({ espnEventId: event.eventId, season, eventName: event.name });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-charcoal-light">Season:</label>
        <select
          value={season}
          onChange={(e) => setSeason(parseInt(e.target.value, 10))}
          className="input py-1 px-2 text-sm w-24"
        >
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="text-sm text-charcoal-light">Loading schedule…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <select
          value={selectedId}
          onChange={(e) => handleSelect(e.target.value)}
          className="input w-full"
        >
          <option value="">Pick an event…</option>
          {events.map((e) => (
            <option key={e.eventId} value={e.eventId}>
              {e.name} ({e.startDate.slice(0, 10)})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
