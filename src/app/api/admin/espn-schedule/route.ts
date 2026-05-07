import { NextRequest, NextResponse } from 'next/server';
import { ESPNClient } from '@/lib/egolfapi';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const seasonParam = request.nextUrl.searchParams.get('season');
    const season = seasonParam ? parseInt(seasonParam, 10) : NaN;
    if (!Number.isInteger(season) || season < 2000 || season > 2100) {
      return NextResponse.json({ error: 'Valid season query param required' }, { status: 400 });
    }

    const client = new ESPNClient({ delayMs: 500 });
    const schedule = await client.getSchedule(season);
    return NextResponse.json(schedule, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (error) {
    console.error('espn-schedule error:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule from ESPN' }, { status: 502 });
  }
}
