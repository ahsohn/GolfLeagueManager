'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TeamData {
  team_id: number;
  team_name: string;
  color: string;
  rankings: number[];
}

interface StandingsHistoryData {
  tournaments: string[];
  teams: TeamData[];
}

interface ChartDataPoint {
  tournament: string;
  [key: string]: string | number;
}

export default function StandingsGraph() {
  const [data, setData] = useState<StandingsHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/standings/history');
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        setData(json);
      } catch {
        setError('Failed to load standings history');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="h-[300px] md:h-[400px] bg-cream-dark/30 rounded-lg animate-pulse flex items-center justify-center">
        <p className="text-charcoal-light">Loading graph...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[300px] md:h-[400px] flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!data || data.tournaments.length === 0) {
    return (
      <div className="h-[300px] md:h-[400px] flex items-center justify-center bg-cream-dark/20 rounded-lg">
        <p className="text-charcoal-light italic">Graph available after first tournament completes</p>
      </div>
    );
  }

  // Transform data for Recharts
  const chartData: ChartDataPoint[] = data.tournaments.map((tournament, index) => {
    const point: ChartDataPoint = { tournament };
    data.teams.forEach(team => {
      point[`team_${team.team_id}`] = team.rankings[index];
    });
    return point;
  });

  const handleLegendClick = (teamId: number) => {
    setSelectedTeam(selectedTeam === teamId ? null : teamId);
  };

  // Abbreviate tournament names if too long
  const abbreviate = (name: string) => {
    if (name.length <= 15) return name;
    return name.substring(0, 12) + '...';
  };

  return (
    <div>
      {/* Chart */}
      <div className="h-[300px] md:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
            <XAxis
              dataKey="tournament"
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickFormatter={abbreviate}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              reversed
              domain={[1, 13]}
              ticks={[1, 3, 5, 7, 9, 11, 13]}
              tick={{ fontSize: 12, fill: '#6B7280' }}
              label={{ value: 'Rank', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#6B7280' }}
              width={50}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length > 0) {
                  const teamEntry = payload[0];
                  const teamId = Number(String(teamEntry.dataKey).replace('team_', ''));
                  const team = data.teams.find(t => t.team_id === teamId);
                  return (
                    <div className="bg-white border border-cream-dark rounded-lg shadow-lg p-3">
                      <p className="font-semibold text-charcoal">{team?.team_name}</p>
                      <p className="text-sm text-charcoal-light">{label}</p>
                      <p className="text-sm font-medium" style={{ color: team?.color }}>
                        Rank: {teamEntry.value}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            {data.teams.map(team => (
              <Line
                key={team.team_id}
                type="linear"
                dataKey={`team_${team.team_id}`}
                stroke={team.color}
                strokeWidth={selectedTeam === null || selectedTeam === team.team_id ? 2 : 1}
                strokeOpacity={selectedTeam === null || selectedTeam === team.team_id ? 1 : 0.2}
                dot={false}
                activeDot={{ r: 6, strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
        {data.teams.map(team => (
          <button
            key={team.team_id}
            onClick={() => handleLegendClick(team.team_id)}
            className={`
              flex items-center gap-2 px-2 py-1 rounded text-sm transition-all
              ${selectedTeam === team.team_id
                ? 'bg-cream-dark font-medium'
                : 'hover:bg-cream-dark/50'}
              ${selectedTeam !== null && selectedTeam !== team.team_id
                ? 'opacity-40'
                : ''}
            `}
          >
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: team.color }}
            />
            <span className="text-charcoal">{team.team_name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
