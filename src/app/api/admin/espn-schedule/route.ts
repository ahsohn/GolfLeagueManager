import { NextRequest, NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { ESPNClient } from '@/lib/egolfapi';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  noStore();
  try {
    const seasonParam = request.nextUrl.searchParams.get('season');
    const season = seasonParam ? parseInt(seasonParam, 10) : NaN;
    if (!Number.isInteger(season) || season < 2000 || season > 2100) {
      return NextResponse.json({ error: 'Valid season query param required' }, { status: 400 });
    }

    const client = new ESPNClient({ delayMs: 500 });
    const schedule = await client.getSchedule(season);
    return NextResponse.json(schedule);
  } catch (error) {
    console.error('espn-schedule error:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule from ESPN' }, { status: 502 });
  }
}
